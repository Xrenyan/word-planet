import { describe, expect, it, vi } from 'vitest'
import { assessWordPronunciation, clearWordAudioRequests, loadWordAudio } from './audioClient'

describe('static pronunciation boundary', () => {
  it('preloads a bundled accent file and returns its local URL', async () => {
    clearWordAudioRequests()
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3', 'en-US': 'audio/us/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true })

    const result = await loadWordAudio('verified-apple', 'en-GB', { fetcher: fetcher as unknown as typeof fetch, term: 'Apple', baseUrl: '/word-planet/' })

    expect(result).toEqual({ status: 'audio', source: 'local', url: '/word-planet/audio/uk/apple.mp3' })
    expect(fetcher).toHaveBeenNthCalledWith(1, '/word-planet/audio/map.json', { headers: { accept: 'application/json' } })
    expect(fetcher).toHaveBeenNthCalledWith(2, '/word-planet/audio/uk/apple.mp3', { cache: 'force-cache' })
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
