export interface VaultStatement {
  bind(...values: (string | number | null)[]): VaultStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ meta: { changes: number } }>
}

export interface VaultDatabase {
  prepare(query: string): VaultStatement
}

export interface VaultEnvironment { DB: VaultDatabase }

const ALLOWED_ORIGINS = new Set(['https://xrenyan.github.io', 'http://127.0.0.1:4177'])
const METHODS = ['GET', 'POST', 'PUT', 'DELETE']
const REQUEST_HEADERS = ['authorization', 'content-type', 'if-match', 'if-none-match']
const MAX_BODY_BYTES = 1_048_576
const VAULT_TTL = 180 * 86_400_000
const MAX_VAULTS = 128
const encoder = new TextEncoder()
type VaultRow = { id: string; secret_hash: string; iv: string; ciphertext: string; revision: number; updated_at: number; expires_at: number }
type Envelope = { iv: string; ciphertext: string }

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: number) { super(message) }
}

function reply(origin: string | null, status: number, body?: unknown, extra: Record<string, string> = {}) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin', ...extra })
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Expose-Headers', 'ETag, Retry-After')
  }
  if (body === undefined) return new Response(null, { status, headers })
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Native HMAC verification compares fixed-length authentication tags without an
// early-return JavaScript string comparison. Neither hash is returned to callers.
let comparisonKey: Promise<CryptoKey> | undefined
async function equalHashes(left: string, right: string) {
  comparisonKey ??= crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  const key = await comparisonKey
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(left))
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(right))
}

function validBase64Url(value: unknown, minBytes: number, maxBytes: number): value is string {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) return false
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return decoded.length >= minBytes && decoded.length <= maxBytes && btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === value
  } catch { return false }
}

async function readEnvelope(request: Request): Promise<Envelope> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '')) throw new HttpError(415, 'json-required')
  const declared = request.headers.get('Content-Length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new HttpError(413, 'payload-too-large')
  if (!request.body) throw new HttpError(400, 'invalid-envelope')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new HttpError(413, 'payload-too-large')
      }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new HttpError(400, 'invalid-envelope') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'invalid-envelope')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2 || !validBase64Url(record.iv, 12, 12) || !validBase64Url(record.ciphertext, 16, MAX_BODY_BYTES)) throw new HttpError(400, 'invalid-envelope')
  return { iv: record.iv, ciphertext: record.ciphertext }
}

async function quota(DB: VaultDatabase, key: string, limit: number, resetAt: number, now: number) {
  const accepted = await DB.prepare(`INSERT INTO vault_rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?3 RETURNING count`)
    .bind(key, resetAt, limit).first<{ count: number }>()
  if (!accepted) throw new HttpError(429, 'rate-limited', Math.max(1, Math.ceil((resetAt - now) / 1000)))
}

async function cleanExpired(DB: VaultDatabase, now: number) {
  await DB.prepare('DELETE FROM vaults WHERE expires_at <= ?1').bind(now).run()
  await DB.prepare('DELETE FROM vault_rate_limits WHERE reset_at <= ?1').bind(now).run()
}

function metadata(row: { revision: number; updated_at: number; expires_at: number }) {
  return { revision: row.revision, updatedAt: row.updated_at, expiresAt: row.expires_at }
}

async function handle(request: Request, env: VaultEnvironment) {
  const origin = request.headers.get('Origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) throw new HttpError(403, 'origin-not-allowed')
  const url = new URL(request.url)
  if (url.search) throw new HttpError(400, 'query-not-allowed')
  const match = /^\/api\/vault\/([^/]+)$/.exec(url.pathname)
  if (!match) throw new HttpError(404, 'not-found')
  const id = match[1]
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(400, 'invalid-vault-id')
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method') ?? ''
    const headers = (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean)
    if (!METHODS.includes(method) || headers.some(header => !REQUEST_HEADERS.includes(header))) throw new HttpError(403, 'preflight-not-allowed')
    return reply(origin, 204, undefined, { 'Access-Control-Allow-Methods': `${METHODS.join(', ')}, OPTIONS`, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match', Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' })
  }
  if (!METHODS.includes(request.method)) return reply(origin, 405, { error: 'method-not-allowed' }, { Allow: `${METHODS.join(', ')}, OPTIONS` })

  const now = Date.now()
  const minute = Math.floor(now / 60_000)
  const day = Math.floor(now / 86_400_000)
  // CF-Connecting-IP is written by Cloudflare, never an untrusted forwarding
  // header. A single shared bucket safely covers local runtimes without it.
  const ipHash = await hash(`${day}:${request.headers.get('CF-Connecting-IP') ?? 'unavailable'}`)
  await env.DB.prepare('DELETE FROM vault_rate_limits WHERE reset_at <= ?1').bind(now).run()
  await quota(env.DB, `requests:day:${day}`, 10_000, (day + 1) * 86_400_000, now)
  await quota(env.DB, `requests:global:${minute}`, 600, (minute + 1) * 60_000, now)
  await quota(env.DB, `requests:${minute}:${ipHash}`, 60, (minute + 1) * 60_000, now)
  await env.DB.prepare('DELETE FROM vaults WHERE expires_at <= ?1').bind(now).run()

  const authorization = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') ?? '')
  if (!authorization || !validBase64Url(authorization[1], 32, 32)) throw new HttpError(404, 'not-found')
  const secretHash = await hash(authorization[1])
  const writing = request.method === 'PUT' || request.method === 'POST'
  const creating = writing && request.headers.get('If-None-Match') === '*'
  let envelope: Envelope | undefined
  let revision: number | undefined
  if (writing) {
    if (request.headers.has('If-None-Match') && request.headers.get('If-None-Match') !== '*') throw new HttpError(400, 'invalid-precondition')
    if (request.method === 'POST' && !creating) throw new HttpError(428, 'create-precondition-required')
    if (creating && request.headers.has('If-Match')) throw new HttpError(400, 'invalid-precondition')
    if (!creating) {
      const condition = request.headers.get('If-Match')
      if (condition === null) throw new HttpError(428, 'revision-required')
      const parsed = /^"?([1-9]\d{0,14})"?$/.exec(condition)
      if (!parsed || (condition.startsWith('"') !== condition.endsWith('"'))) throw new HttpError(400, 'invalid-revision')
      revision = Number(parsed[1])
    }
    envelope = await readEnvelope(request)
  }
  const row = await env.DB.prepare('SELECT * FROM vaults WHERE id = ?1 AND expires_at > ?2').bind(id, now).first<VaultRow>()
  const authenticated = await equalHashes(secretHash, row?.secret_hash ?? '0'.repeat(64))
  if (row && !authenticated) throw new HttpError(404, 'not-found')
  if (creating) {
    if (row) throw new HttpError(409, 'revision-conflict')
    await quota(env.DB, `create:global:${day}`, 100, (day + 1) * 86_400_000, now)
    await quota(env.DB, `create:${day}:${ipHash}`, 5, (day + 1) * 86_400_000, now)
    // Capacity checking and the insert execute in one SQLite statement. Neither
    // racing requests nor duplicate IDs can overwrite an existing record.
    const inserted = await env.DB.prepare(`INSERT INTO vaults (id, secret_hash, iv, ciphertext, revision, updated_at, expires_at)
      SELECT ?1, ?2, ?3, ?4, 1, ?5, ?6 WHERE (SELECT COUNT(*) FROM vaults) < ?7
      ON CONFLICT(id) DO NOTHING RETURNING revision, updated_at, expires_at`)
      .bind(id, secretHash, envelope!.iv, envelope!.ciphertext, now, now + VAULT_TTL, MAX_VAULTS).first<VaultRow>()
    if (inserted) return reply(origin, 201, metadata(inserted), { ETag: '"1"' })
    const concurrent = await env.DB.prepare('SELECT secret_hash FROM vaults WHERE id = ?1').bind(id).first<{ secret_hash: string }>()
    if (concurrent) {
      const ownsConcurrent = await equalHashes(secretHash, concurrent.secret_hash)
      throw new HttpError(ownsConcurrent ? 409 : 404, ownsConcurrent ? 'revision-conflict' : 'not-found')
    }
    throw new HttpError(503, 'capacity-reached')
  }
  if (!row || !authenticated) throw new HttpError(404, 'not-found')
  if (request.method === 'GET') return reply(origin, 200, { iv: row.iv, ciphertext: row.ciphertext, ...metadata(row) }, { ETag: `"${row.revision}"` })
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM vaults WHERE id = ?1 AND secret_hash = ?2').bind(id, secretHash).run()
    return reply(origin, 204)
  }
  const updated = await env.DB.prepare(`UPDATE vaults SET iv = ?1, ciphertext = ?2, revision = revision + 1, updated_at = ?3, expires_at = ?4
    WHERE id = ?5 AND secret_hash = ?6 AND revision = ?7 AND expires_at > ?3 RETURNING revision, updated_at, expires_at`)
    .bind(envelope!.iv, envelope!.ciphertext, now, now + VAULT_TTL, id, secretHash, revision!).first<VaultRow>()
  if (!updated) throw new HttpError(409, 'revision-conflict')
  return reply(origin, 200, metadata(updated), { ETag: `"${updated.revision}"` })
}

export default {
  async fetch(request: Request, env: VaultEnvironment): Promise<Response> {
    try { return await handle(request, env) } catch (error) {
      if (error instanceof HttpError) return reply(request.headers.get('Origin'), error.status, { error: error.message }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {})
      // Avoid returning database details, secrets or payloads in error bodies.
      return reply(request.headers.get('Origin'), 503, { error: 'service-unavailable' })
    }
  },
  async scheduled(_controller: unknown, env: VaultEnvironment) {
    await cleanExpired(env.DB, Date.now())
  },
}
