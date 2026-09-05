// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import worker from './worker'
import { createTestDatabase } from './sqliteTestAdapter'

const origin = 'https://xrenyan.github.io'
const id = '0123456789abcdef0123456789abcdef'
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const wrongSecret = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA'
const encrypted = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA' }
let database: ReturnType<typeof createTestDatabase>

beforeEach(() => { database = createTestDatabase() })
afterEach(() => { database.sqlite.close() })

function request(method: string, options: { id?: string; secret?: string; headers?: Record<string, string>; body?: unknown; raw?: string; origin?: string } = {}) {
  const headers = new Headers({ Origin: options.origin ?? origin, Authorization: `Bearer ${options.secret ?? secret}`, 'CF-Connecting-IP': '203.0.113.2', ...options.headers })
  let body: string | undefined
  if (method === 'PUT' || method === 'POST') {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    body = options.raw ?? JSON.stringify(options.body === undefined ? encrypted : options.body)
  }
  return worker.fetch(new Request(`https://sync.example/api/vault/${options.id ?? id}`, { method, headers, body }), { DB: database.DB })
}
const create = (options: Parameters<typeof request>[1] = {}) => request('PUT', { ...options, headers: { 'If-None-Match': '*', ...options.headers } })

describe('encrypted vault API with SQLite', () => {
  it('creates an encrypted record, hashes its secret, and serves only the envelope', async () => {
    const response = await create()
    expect(response.status).toBe(201)
    expect(response.headers.get('ETag')).toBe('"1"')
    const created = await response.json()
    expect(created.revision).toBe(1)
    expect(created.expiresAt - created.updatedAt).toBe(180 * 86_400_000)
    const row = database.sqlite.prepare('SELECT * FROM vaults').get()!
    expect(row.secret_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.secret_hash).not.toBe(secret)
    expect(row.ciphertext).toBe(encrypted.ciphertext)
    const get = await request('GET')
    expect(get.status).toBe(200)
    expect(get.headers.get('Cache-Control')).toBe('no-store')
    expect(await get.json()).toEqual({ ...created, ...encrypted })
  })

  it('hides missing records and rejects wrong or absent credentials for every operation', async () => {
    await create()
    for (const method of ['GET', 'DELETE', 'PUT']) {
      const wrong = await request(method, { secret: wrongSecret, headers: { 'If-Match': '"1"' } })
      expect(wrong.status).toBe(404)
      expect(await wrong.json()).toEqual({ error: 'not-found' })
    }
    expect((await request('GET', { secret: '' })).status).toBe(404)
    expect((await request('GET', { id: 'f'.repeat(32) })).status).toBe(404)
    expect((await create({ secret: wrongSecret })).status).toBe(404)
    expect(database.sqlite.prepare('SELECT revision FROM vaults').get()?.revision).toBe(1)
  })

  it('allows exactly one concurrent creation and one update at each revision', async () => {
    const creates = await Promise.all([create(), create()])
    expect(creates.map(result => result.status).sort()).toEqual([201, 409])
    const updates = await Promise.all([
      request('PUT', { headers: { 'If-Match': '"1"' } }),
      request('PUT', { headers: { 'If-Match': '"1"' } }),
    ])
    expect(updates.map(result => result.status).sort()).toEqual([200, 409])
    expect(database.sqlite.prepare('SELECT revision FROM vaults').get()?.revision).toBe(2)
    expect((await request('PUT')).status).toBe(428)
  })

  it('deletes only an authorized record', async () => {
    await create()
    expect((await request('DELETE', { secret: wrongSecret })).status).toBe(404)
    expect((await request('DELETE')).status).toBe(204)
    expect((await request('GET')).status).toBe(404)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(0)
  })

  it('treats expired records as missing and reclaims their storage', async () => {
    await create()
    database.sqlite.prepare('UPDATE vaults SET expires_at = 1').run()
    expect((await request('GET')).status).toBe(404)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(0)
  })

  it('validates IDs, media type, the encrypted envelope, preconditions and body bounds', async () => {
    expect((await create({ id: 'bad' })).status).toBe(400)
    expect((await create({ headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    for (const body of [null, [], { ...encrypted, progress: [] }, { ...encrypted, iv: 'bad' }, { ...encrypted, ciphertext: 42 }, { ...encrypted, ciphertext: 'A' }]) {
      expect((await create({ body })).status).toBe(400)
    }
    expect((await create({ raw: '{' })).status).toBe(400)
    expect((await create({ raw: ' '.repeat(1_048_577) })).status).toBe(413)
    expect((await request('PUT', { headers: { 'If-Match': '0' } })).status).toBe(400)
    expect((await request('PATCH')).status).toBe(405)
    expect((await request('POST')).status).toBe(428)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(0)
  })

  it('supports POST as an explicit create-only operation and rejects contradictory conditions', async () => {
    expect((await request('POST', { headers: { 'If-None-Match': '*' } })).status).toBe(201)
    expect((await request('POST', { headers: { 'If-Match': '"1"' } })).status).toBe(428)
    expect((await request('PUT', { headers: { 'If-None-Match': 'nonsense', 'If-Match': '"1"' } })).status).toBe(400)
    expect((await request('PUT', { headers: { 'If-None-Match': '*', 'If-Match': '"1"' } })).status).toBe(400)
  })

  it('allows only approved browser origins and requested preflight headers', async () => {
    const preflight = await request('OPTIONS', { headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type,if-none-match' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('If-Match')
    expect((await request('GET', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await request('GET', { origin: '' })).status).toBe(403)
    expect((await request('OPTIONS', { headers: { 'Access-Control-Request-Method': 'PATCH' } })).status).toBe(403)
    expect((await request('OPTIONS', { headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-bypass' } })).status).toBe(403)
    expect((await request('GET', { origin: 'http://127.0.0.1:4177' })).headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4177')
  })

  it('limits anonymous creations per IP and never stores a raw IP', async () => {
    for (let i = 0; i < 5; i++) expect((await create({ id: i.toString(16).padStart(32, '0') })).status).toBe(201)
    const denied = await create({ id: 'f'.repeat(32) })
    expect(denied.status).toBe(429)
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(5)
    expect(JSON.stringify(database.sqlite.prepare('SELECT * FROM vault_rate_limits').all())).not.toContain('203.0.113.2')
  })

  it('bounds unauthenticated reads per IP', async () => {
    const results: number[] = []
    for (let i = 0; i < 61; i++) results.push((await request('GET')).status)
    expect(results.slice(0, 60).every(status => status === 404)).toBe(true)
    expect(results[60]).toBe(429)
  })

  it('enforces global capacity and creation budgets even for a different IP', async () => {
    await create()
    const copy = database.sqlite.prepare('INSERT INTO vaults SELECT ?, secret_hash, iv, ciphertext, revision, updated_at, expires_at FROM vaults WHERE id = ?')
    for (let i = 0; i < 127; i++) copy.run(i.toString(16).padStart(32, '0'), id)
    expect((await create({ id: 'f'.repeat(32), headers: { 'CF-Connecting-IP': '203.0.113.99' } })).status).toBe(503)
    database.sqlite.prepare('UPDATE vault_rate_limits SET count = 100 WHERE key LIKE ?').run('create:global:%')
    expect((await create({ id: 'e'.repeat(32), headers: { 'CF-Connecting-IP': '203.0.113.100' } })).status).toBe(429)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(128)
  })

  it('keeps credentials out of query strings and cleans expired rows on the scheduled job', async () => {
    const queried = new Request(`https://sync.example/api/vault/${id}?secret=${secret}`, { headers: { Origin: origin } })
    expect((await worker.fetch(queried, { DB: database.DB })).status).toBe(400)
    await create()
    database.sqlite.prepare('UPDATE vaults SET expires_at = 1').run()
    database.sqlite.prepare('UPDATE vault_rate_limits SET reset_at = 1').run()
    await worker.scheduled({}, { DB: database.DB })
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(0)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vault_rate_limits').get()?.count).toBe(0)
  })
})
