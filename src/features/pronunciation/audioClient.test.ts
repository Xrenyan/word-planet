import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assessWordPronunciation, clearWordAudioRequests, loadWordAudio } from './audioClient'
import { playAudioUrl, stopAudioPlayback } from './playback'

function mp3Bytes() {
  const bytes = new Uint8Array(256)
  bytes.set([0xff, 0xf3, 0x84])
  return bytes.buffer
}

afterEach(() => {
  stopAudioPlayback()
  clearWordAudioRequests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function audioEnvironment() {
  const elements: Array<ReturnType<typeof createElement>> = []
  function createElement(source: string) {
    const events = new EventTarget()
    return { source, preload: 'none', currentTime: 0, playbackRate: 1,
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      play: vi.fn(async () => undefined), pause: vi.fn(), removeAttribute: vi.fn(),
      end: () => events.dispatchEvent(new Event('ended')), fail: () => events.dispatchEvent(new Event('error')) }
  }
  vi.stubGlobal('Audio', vi.fn(function (source: string) { const element = createElement(source); elements.push(element); return element }))
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:prepared-${elements.length}`)
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return { elements, createObjectURL, revokeObjectURL }
}

let nativeAudio: ReturnType<typeof audioEnvironment>
beforeEach(() => { nativeAudio = audioEnvironment() })

describe('static pronunciation boundary', () => {
  it('prepares the fetched bytes before a click and reuses the same native player for replay', async () => {
    const { elements, createObjectURL } = nativeAudio
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => mp3Bytes() })
    const result = await loadWordAudio('apple', 'en-GB', { fetcher, term: 'apple', baseUrl: '/' })
    expect(result.status).toBe('audio')
    expect(elements).toHaveLength(1)
    expect(elements[0].source).toMatch(/^blob:prepared-/)
    expect(elements[0].preload).toBe('auto')
    expect(createObjectURL.mock.calls[0][0]).toMatchObject({ size: 256, type: 'audio/mpeg' })
    if (result.status !== 'audio') return
    const first = playAudioUrl(result.url)
    expect(elements).toHaveLength(1)
    expect(elements[0].play).toHaveBeenCalledOnce()
    elements[0].currentTime = 1.5
    elements[0].end()
    await first
    const replay = playAudioUrl(result.url, { rate: .72 })
    expect(elements).toHaveLength(1)
    expect(elements[0].currentTime).toBe(0)
    expect(elements[0].playbackRate).toBe(.72)
    elements[0].end()
    await replay
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('releases preloaded blob resources when pronunciation caches are cleared', async () => {
    const { elements, createObjectURL, revokeObjectURL } = nativeAudio
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => mp3Bytes() })
    await loadWordAudio('apple', 'en-GB', { fetcher, term: 'apple', baseUrl: '/' })
    expect(createObjectURL).toHaveBeenCalledOnce()
    clearWordAudioRequests()
    expect(revokeObjectURL).toHaveBeenCalledWith(elements[0].source)
    expect(elements[0].removeAttribute).toHaveBeenCalledWith('src')
  })

  it('retries with a new native player after a prepared decoder fails', async () => {
    const { elements, revokeObjectURL } = nativeAudio
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ terms: { apple: { 'en-GB': 'audio/uk/apple.mp3' } } }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => mp3Bytes() })
    await loadWordAudio('apple', 'en-GB', { fetcher, term: 'apple', baseUrl: '/' })
    const failed = playAudioUrl('/audio/uk/apple.mp3').catch(error => error.message)
    elements[0].fail()
    await expect(failed).resolves.toBe('Audio playback failed')
    expect(revokeObjectURL).toHaveBeenCalledWith(elements[0].source)
    const retry = playAudioUrl('/audio/uk/apple.mp3')
    expect(elements).toHaveLength(2)
    expect(elements[1].source).toBe('/audio/uk/apple.mp3')
    elements[1].end()
    await retry
  })

  it('releases older prepared players during a long session without interrupting the current clip', async () => {
    const { elements, revokeObjectURL } = nativeAudio
    const terms = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`term-${index}`, { 'en-GB': `audio/uk/${index}.mp3` }]))
    const fetcher = vi.fn(async (url: string) => url.endsWith('.json')
      ? { ok: true, json: async () => ({ terms }) }
      : { ok: true, arrayBuffer: async () => mp3Bytes() })
    const load = (index: number) => loadWordAudio(`word-${index}`, 'en-GB', { fetcher: fetcher as unknown as typeof fetch, term: `term-${index}`, baseUrl: '/' })
    await load(0)
    const playing = playAudioUrl('/audio/uk/0.mp3').catch(error => error.name)
    for (let index = 1; index < 40; index++) await load(index)
    expect(revokeObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalledWith(elements[0].source)
    expect(elements[0].pause).not.toHaveBeenCalled()
    elements[0].end()
    await playing
    // Revisiting an evicted word prewarms it again before the next click.
    await load(1)
    expect(elements).toHaveLength(41)
    const replay = playAudioUrl('/audio/uk/1.mp3')
    expect(elements).toHaveLength(41)
    expect(elements[40].play).toHaveBeenCalledOnce()
    elements[40].end()
    await replay
  })
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
