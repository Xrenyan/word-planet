export type VaultMetadata = { revision: number; updatedAt: number; expiresAt: number }
export type VaultSnapshot<T> = VaultMetadata & { data: T }
export type VaultClientOptions = { fetch?: typeof globalThis.fetch }
export type EncryptedEnvelope = { iv: string; ciphertext: string }

export class VaultError extends Error {
  constructor(readonly code: string, readonly status = 0, readonly retryAfter?: number) { super(code); this.name = 'VaultError' }
}

const MAX_BODY_BYTES = 1_048_576
const TIMEOUT_MS = 10_000
const encoder = new TextEncoder()

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new VaultError('encryption-unavailable')
  return globalThis.crypto
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_BODY_BYTES) throw new VaultError('invalid-envelope')
  let binary: string
  try { binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')) } catch { throw new VaultError('invalid-envelope') }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (base64Url(bytes) !== value) throw new VaultError('invalid-envelope')
  return bytes
}

/** Treat the whole code as a password; never put it in a URL or telemetry. */
export function generatePairingCode(): string {
  const vaultId = Array.from(webCrypto().getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  return `${vaultId}.${base64Url(webCrypto().getRandomValues(new Uint8Array(32)))}`
}

export function parsePairingCode(code: string): { vaultId: string; secret: string } {
  const matched = typeof code === 'string' && /^([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(code.trim())
  if (!matched) throw new VaultError('invalid-pairing-code')
  try {
    if (decodeBase64Url(matched[2]).byteLength !== 32) throw new Error()
  } catch { throw new VaultError('invalid-pairing-code') }
  return { vaultId: matched[1], secret: matched[2] }
}

async function keyMaterial(code: string) {
  const { vaultId, secret } = parsePairingCode(code)
  const material = await webCrypto().subtle.importKey('raw', decodeBase64Url(secret), 'HKDF', false, ['deriveKey', 'deriveBits'])
  const salt = Uint8Array.from(vaultId.match(/../g)!, byte => Number.parseInt(byte, 16))
  return { vaultId, material, salt }
}

async function encryptionKey(code: string) {
  const { vaultId, material, salt } = await keyMaterial(code)
  const key = await webCrypto().subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('word-planet:v1:encryption') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { key, additionalData: encoder.encode(`word-planet:v1:${vaultId}`) }
}

async function authorization(code: string) {
  const { material, salt } = await keyMaterial(code)
  const bits = await webCrypto().subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('word-planet:v1:authorization') }, material, 256)
  return `Bearer ${base64Url(new Uint8Array(bits))}`
}

export async function encryptVaultData(code: string, data: unknown): Promise<EncryptedEnvelope> {
  let json: string | undefined
  try { json = JSON.stringify(data) } catch { throw new VaultError('invalid-data') }
  if (json === undefined) throw new VaultError('invalid-data')
  const plaintext = encoder.encode(json)
  if (plaintext.byteLength > Math.floor((MAX_BODY_BYTES - 128) * 3 / 4) - 16) throw new VaultError('payload-too-large')
  const { key, additionalData } = await encryptionKey(code)
  const iv = webCrypto().getRandomValues(new Uint8Array(12))
  const ciphertext = await webCrypto().subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, plaintext)
  return { iv: base64Url(iv), ciphertext: base64Url(new Uint8Array(ciphertext)) }
}

/** Callers must validate decrypted application data before importing it. */
export async function decryptVaultData<T>(code: string, encrypted: EncryptedEnvelope): Promise<T> {
  const { key, additionalData } = await encryptionKey(code)
  try {
    if (!encrypted || typeof encrypted.iv !== 'string' || typeof encrypted.ciphertext !== 'string') throw new Error()
    const iv = decodeBase64Url(encrypted.iv)
    const ciphertext = decodeBase64Url(encrypted.ciphertext)
    if (iv.byteLength !== 12 || ciphertext.byteLength < 16) throw new Error()
    const plaintext = await webCrypto().subtle.decrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, ciphertext)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as T
  } catch { throw new VaultError('decryption-failed') }
}

function endpoint(apiOrigin: string, code: string) {
  let url: URL
  try { url = new URL(apiOrigin) } catch { throw new VaultError('invalid-api-origin') }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  if (!secure || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new VaultError('invalid-api-origin')
  return `${url.origin}/api/vault/${parsePairingCode(code).vaultId}`
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }

function metadata(value: unknown): VaultMetadata {
  if (!isRecord(value) || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1 || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= value.updatedAt) throw new VaultError('invalid-server-response')
  return { revision: value.revision, updatedAt: value.updatedAt, expiresAt: value.expiresAt }
}

async function responseJson(response: Response) {
  if (!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type') ?? '') || !response.body) throw new VaultError('invalid-server-response', response.status)
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let json = ''
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_BODY_BYTES + 1024) { await reader.cancel(); throw new VaultError('invalid-server-response', response.status) }
      json += decoder.decode(part.value, { stream: true })
    }
    json += decoder.decode()
    return JSON.parse(json) as unknown
  } catch (error) {
    if (error instanceof VaultError) throw error
    throw new VaultError('invalid-server-response', response.status)
  } finally { reader.releaseLock() }
}

async function send(apiOrigin: string, code: string, method: string, headers: Record<string, string>, envelope: EncryptedEnvelope | undefined, options: VaultClientOptions = {}) {
  const url = endpoint(apiOrigin, code)
  const token = await authorization(code)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method, headers: { Authorization: token, ...headers }, body: envelope ? JSON.stringify(envelope) : undefined,
      signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors',
    })
    if (response.status === 204 && method === 'DELETE') return undefined
    if (response.ok && (method === 'DELETE' || response.status !== (headers['If-None-Match'] === '*' ? 201 : 200))) throw new VaultError('invalid-server-response', response.status)
    const value = await responseJson(response)
    if (!response.ok) {
      const code = isRecord(value) && typeof value.error === 'string' && /^[a-z-]{1,64}$/.test(value.error) ? value.error : 'request-failed'
      const retryAfter = Number(response.headers.get('Retry-After'))
      throw new VaultError(code, response.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
    }
    return value
  } catch (error) {
    if (controller.signal.aborted) throw new VaultError('request-timeout')
    if (error instanceof VaultError) throw error
    throw new VaultError('network-error')
  } finally { clearTimeout(timeout) }
}

export async function createVault(apiOrigin: string, code: string, data: unknown, options?: VaultClientOptions): Promise<VaultMetadata> {
  endpoint(apiOrigin, code)
  const envelope = await encryptVaultData(code, data)
  return metadata(await send(apiOrigin, code, 'PUT', { 'Content-Type': 'application/json', 'If-None-Match': '*' }, envelope, options))
}

export async function readVault<T>(apiOrigin: string, code: string, options?: VaultClientOptions): Promise<VaultSnapshot<T>> {
  const value = await send(apiOrigin, code, 'GET', {}, undefined, options)
  const meta = metadata(value)
  if (!isRecord(value) || typeof value.iv !== 'string' || typeof value.ciphertext !== 'string') throw new VaultError('invalid-server-response')
  return { ...meta, data: await decryptVaultData<T>(code, { iv: value.iv, ciphertext: value.ciphertext }) }
}

export async function updateVault(apiOrigin: string, code: string, data: unknown, revision: number, options?: VaultClientOptions): Promise<VaultMetadata> {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new VaultError('invalid-revision')
  endpoint(apiOrigin, code)
  const envelope = await encryptVaultData(code, data)
  return metadata(await send(apiOrigin, code, 'PUT', { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` }, envelope, options))
}

export async function deleteVault(apiOrigin: string, code: string, options?: VaultClientOptions): Promise<void> {
  await send(apiOrigin, code, 'DELETE', {}, undefined, options)
}

/** Merge must validate application data and resolve event IDs deterministically. */
export async function syncVault<T>(apiOrigin: string, code: string, local: T, merge: (local: T, remote: T) => T, options?: VaultClientOptions): Promise<VaultSnapshot<T>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await readVault<T>(apiOrigin, code, options)
    const data = merge(local, remote.data)
    if (JSON.stringify(data) === JSON.stringify(remote.data)) return { ...remote, data }
    try { return { ...await updateVault(apiOrigin, code, data, remote.revision, options), data } } catch (error) {
      if (!(error instanceof VaultError) || error.status !== 409 || attempt === 2) throw error
    }
  }
  throw new VaultError('revision-conflict', 409)
}
