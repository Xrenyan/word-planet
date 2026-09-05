// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../../../backend/worker'
import { createTestDatabase } from '../../../backend/sqliteTestAdapter'
import { createVault, decryptVaultData, deleteVault, encryptVaultData, generatePairingCode, parsePairingCode, readVault, syncVault, updateVault } from './vaultClient'

let database: ReturnType<typeof createTestDatabase>
let sent: Request[]
const api = 'https://sync.example'
beforeEach(() => { database = createTestDatabase(); sent = [] })
afterEach(() => { database.sqlite.close(); vi.useRealTimers() })

function transport(): typeof globalThis.fetch {
  return async (url, init) => {
    const request = new Request(url, init)
    sent.push(request.clone())
    request.headers.set('Origin', 'https://xrenyan.github.io')
    request.headers.set('CF-Connecting-IP', '203.0.113.10')
    return worker.fetch(request, { DB: database.DB })
  }
}

describe('encrypted pairing and backup', () => {
  it('generates independently random 128-bit IDs and 256-bit pairing secrets', () => {
    const first = generatePairingCode()
    const second = generatePairingCode()
    expect(first).toMatch(/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/)
    expect(parsePairingCode(first).vaultId).not.toBe(parsePairingCode(second).vaultId)
    expect(parsePairingCode(first).secret).not.toBe(parsePairingCode(second).secret)
    expect(parsePairingCode(` ${first}\n`)).toEqual(parsePairingCode(first))
    expect(() => parsePairingCode('bad-code')).toThrow('invalid-pairing-code')
  })

  it('uses fresh AES-GCM IVs and detects tampering, wrong keys, and swapped vault IDs', async () => {
    const code = generatePairingCode()
    const data = { events: [{ id: 'event-1', outcome: 'correct' }] }
    const first = await encryptVaultData(code, data)
    const second = await encryptVaultData(code, data)
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(JSON.stringify(first)).not.toContain('event-1')
    expect(await decryptVaultData(code, first)).toEqual(data)
    const changed = { ...first, ciphertext: `${first.ciphertext[0] === 'A' ? 'B' : 'A'}${first.ciphertext.slice(1)}` }
    await expect(decryptVaultData(code, changed)).rejects.toThrow('decryption-failed')
    await expect(decryptVaultData(generatePairingCode(), first)).rejects.toThrow('decryption-failed')
    await expect(decryptVaultData(`${'f'.repeat(32)}.${parsePairingCode(code).secret}`, first)).rejects.toThrow('decryption-failed')
  })

  it('completes create, pair on another device, merge and delete against the real worker and SQLite', async () => {
    const code = generatePairingCode()
    const options = { fetch: transport() }
    const first = await createVault(api, code, ['device-one-event'], options)
    expect(first.revision).toBe(1)
    expect((await readVault<string[]>(api, code, options)).data).toEqual(['device-one-event'])
    const merged = await syncVault(api, code, ['device-two-event'], (local, remote: string[]) => [...new Set([...remote, ...local])], options)
    expect(merged.data).toEqual(['device-one-event', 'device-two-event'])
    expect(merged.revision).toBe(2)
    expect((await readVault<string[]>(api, code, options)).data).toEqual(merged.data)
    const request = sent[0]
    expect(new URL(request.url).search).toBe('')
    const bearer = request.headers.get('Authorization')!
    expect(bearer).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/)
    expect(bearer).not.toContain(parsePairingCode(code).secret)
    const body = await request.text()
    expect(body).not.toContain('device-one-event')
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['ciphertext', 'iv'])
    const stolenBearerCode = `${parsePairingCode(code).vaultId}.${bearer.slice(7)}`
    await expect(decryptVaultData(stolenBearerCode, JSON.parse(body))).rejects.toThrow('decryption-failed')
    await deleteVault(api, code, options)
    await expect(readVault(api, code, options)).rejects.toMatchObject({ code: 'not-found', status: 404 })
  })

  it('re-reads and re-merges when a second device writes between reading and saving', async () => {
    const code = generatePairingCode()
    const direct = transport()
    await createVault(api, code, ['first'], { fetch: direct })
    let raced = false
    const competingFetch: typeof globalThis.fetch = async (url, init) => {
      if (!raced && init?.method === 'PUT') {
        raced = true
        await updateVault(api, code, ['first', 'racing-device'], 1, { fetch: direct })
      }
      return direct(url, init)
    }
    const merged = await syncVault(api, code, ['local'], (local, remote: string[]) => [...new Set([...remote, ...local])], { fetch: competingFetch })
    expect(merged.data).toEqual(['first', 'racing-device', 'local'])
    expect(merged.revision).toBe(3)
    expect((await readVault<string[]>(api, code, { fetch: direct })).data).toEqual(merged.data)
  })

  it('does not upload again when a merge contains no changes', async () => {
    const code = generatePairingCode()
    const options = { fetch: transport() }
    await createVault(api, code, ['first'], options)
    const snapshot = await syncVault(api, code, ['first'], (_local, remote: string[]) => remote, options)
    expect(snapshot.revision).toBe(1)
    expect((await readVault<string[]>(api, code, options)).revision).toBe(1)
  })

  it('rejects oversized data, invalid revisions and unsafe endpoint URLs before network access', async () => {
    const code = generatePairingCode()
    const options = { fetch: transport() }
    await expect(createVault(api, code, 'A'.repeat(1_048_576), options)).rejects.toThrow('payload-too-large')
    await expect(updateVault(api, code, [], 0, options)).rejects.toThrow('invalid-revision')
    for (const url of ['http://sync.example', 'https://sync.example?secret=123', 'https://user:pass@sync.example', 'https://sync.example/a']) {
      await expect(readVault(url, code, options)).rejects.toThrow('invalid-api-origin')
    }
    expect(sent).toHaveLength(0)
  })

  it('aborts an unresponsive request after ten seconds', async () => {
    vi.useFakeTimers()
    let started = false
    const stalled: typeof globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      started = true
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    const failure = expect(readVault(api, generatePairingCode(), { fetch: stalled })).rejects.toMatchObject({ code: 'request-timeout' })
    await vi.waitFor(() => expect(started).toBe(true))
    await vi.advanceTimersByTimeAsync(10_100)
    await failure
  })

  it('rejects malformed success responses and does not claim an unconfirmed deletion succeeded', async () => {
    const code = generatePairingCode()
    await expect(readVault(api, code, { fetch: async () => Response.json({ revision: 1 }) })).rejects.toThrow('invalid-server-response')
    await expect(readVault(api, code, { fetch: async () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }) })).rejects.toThrow('invalid-server-response')
    await expect(deleteVault(api, code, { fetch: async () => Response.json({ error: 'not-deleted' }) })).rejects.toThrow('invalid-server-response')
  })

  it('reports a rate limit with its retry delay and does not auto-create a missing vault', async () => {
    const options = { fetch: transport() }
    for (let i = 0; i < 5; i++) await createVault(api, generatePairingCode(), [], options)
    await expect(createVault(api, generatePairingCode(), [], options)).rejects.toMatchObject({ code: 'rate-limited', status: 429, retryAfter: expect.any(Number) })
    await expect(syncVault(api, generatePairingCode(), ['local'], (_local, remote: string[]) => remote, options)).rejects.toMatchObject({ code: 'not-found', status: 404 })
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(5)
  })

  it('stops after three revision conflicts without silently overwriting another device', async () => {
    const code = generatePairingCode()
    const direct = transport()
    await createVault(api, code, ['first'], { fetch: direct })
    const competingFetch: typeof globalThis.fetch = async (url, init) => {
      if (init?.method === 'PUT') {
        const latest = await readVault<string[]>(api, code, { fetch: direct })
        await updateVault(api, code, [...latest.data, `racing-${latest.revision}`], latest.revision, { fetch: direct })
      }
      return direct(url, init)
    }
    await expect(syncVault(api, code, ['local'], (local, remote: string[]) => [...remote, ...local], { fetch: competingFetch })).rejects.toMatchObject({ code: 'revision-conflict', status: 409 })
    const latest = await readVault<string[]>(api, code, { fetch: direct })
    expect(latest.revision).toBe(4)
    expect(latest.data).toEqual(['first', 'racing-1', 'racing-2', 'racing-3'])
  })
})
