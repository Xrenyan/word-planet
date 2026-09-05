import { describe, expect, it, vi } from 'vitest'
import { assessWordPronunciation, clearWordAudioRequests, loadWordAudio } from './audioClient'

function mp3Bytes() {
  const bytes = new Uint8Array(256)
  bytes.set([0xff, 0xf3, 0x84])
  return bytes.buffer
}

describe('static pronunciation boundary', () => {
  it('does not call a cached HTML error page ready-to-play audio', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>' + 'offline fallback'.repeat(30) + '</html>').buffer })
    await expect(loadWordAudio('apple', 'en-GB', { fetcher, term: 'apple', baseUrl: '/' }))
      .resolves.toMatchObject({ status: 'device-fallback', locale: 'en-GB' })
  })
  it('uses word-specific past-tense audio before a same-spelling term entry', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        words: { 'past-read': { 'en-GB': 'audio/uk/read-past.mp3' } },
        terms: { read: { 'en-GB': 'audio/uk/read-present.mp3' } },
      }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => mp3Bytes() })
    await expect(loadWordAudio('past-read', 'en-GB', { fetcher, term: 'read', baseUrl: '/' }))
      .resolves.toEqual({ status: 'audio', source: 'local', url: '/audio/uk/read-past.mp3' })
  })
  it('preloads a bundled accent file and returns its local URL', async () => {
    clearWordAudioRequests()
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3', 'en-US': 'audio/us/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => mp3Bytes() })

    const result = await loadWordAudio('verified-apple', 'en-GB', { fetcher: fetcher as unknown as typeof fetch, term: 'Apple', baseUrl: '/word-planet/' })

    expect(result).toEqual({ status: 'audio', source: 'local', url: '/word-planet/audio/uk/apple.mp3' })
    expect(fetcher).toHaveBeenNthCalledWith(1, '/word-planet/audio/map.json', expect.objectContaining({ headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) }))
    expect(fetcher).toHaveBeenNthCalledWith(2, '/word-planet/audio/uk/apple.mp3', expect.objectContaining({ cache: 'force-cache', signal: expect.any(AbortSignal) }))
    await loadWordAudio('verified-apple', 'en-GB', { fetcher: fetcher as unknown as typeof fetch, term: 'Apple', baseUrl: '/word-planet/' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls back to the exact device accent when bundled audio cannot be read', async () => {
    clearWordAudioRequests()
    const fetcher = vi.fn().mockRejectedValue(new Error('offline cache miss'))

    const result = await loadWordAudio('verified-apple', 'en-US', { fetcher: fetcher as unknown as typeof fetch, term: 'apple', baseUrl: '/word-planet/' })

    expect(result).toEqual({ status: 'device-fallback', locale: 'en-US', reason: 'bundled-audio-unavailable' })
  })

  it('does not invent a cloud pronunciation assessment on the static site', async () => {
    const fetcher = vi.fn()

    const result = await assessWordPronunciation('verified-apple', 'en-US', new Blob(['voice']), fetcher as unknown as typeof fetch)

    expect(result).toEqual({ status: 'assessmentUnavailable', reason: 'static-site-local-replay-only', localReplayAvailable: true })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
