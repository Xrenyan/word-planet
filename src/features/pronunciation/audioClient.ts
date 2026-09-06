import type { Accent } from '../../pronunciation/voiceCatalog'
import { clearPreparedAudio, prepareAudioUrl } from './playback'

export type WordAudioResult =
  | { status: 'audio'; source: 'cloud' | 'cache' | 'local'; url: string }
  | { status: 'device-fallback'; locale: Accent; reason: string }
  | { status: 'unavailable'; reason: string }

type AudioClientDependencies = {
  fetcher?: typeof fetch
  term?: string
  baseUrl?: string
}

type AudioMap = { terms: Record<string, Partial<Record<Accent, string>>>; words?: Record<string, Partial<Record<Accent, string>>> }
let requests = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>()

function shared<T>(fetcher: typeof fetch, key: string, create: () => Promise<T>): Promise<T> {
  let cache = requests.get(fetcher)
  if (!cache) { cache = new Map(); requests.set(fetcher, cache) }
  const cached = cache.get(key)
  if (cached) return cached as Promise<T>
  const request = create().catch(error => { cache.delete(key); throw error })
  cache.set(key, request)
  return request
}

type AssessmentResult =
  | { status: 'assessed'; provider: 'azure'; locale: Accent; accuracy: number; fluency: number; completeness: number; pronunciation: number }
  | { status: 'assessmentUnavailable'; reason: string; localReplayAvailable: true }

function joinBase(baseUrl: string, path: string) {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${path.replace(/^\//, '')}`
}

export async function loadWordAudio(wordId: string, locale: Accent, termOrDependencies: string | AudioClientDependencies = {}): Promise<WordAudioResult> {
  const dependencies = typeof termOrDependencies === 'string' ? { term: termOrDependencies } : termOrDependencies
  const fetcher = dependencies.fetcher ?? fetch
  const baseUrl = dependencies.baseUrl ?? import.meta.env.BASE_URL
  const term = dependencies.term?.toLocaleLowerCase('en').trim()
  if (!term) return { status: 'device-fallback', locale, reason: 'bundled-audio-unavailable' }
  try {
    const mapUrl = joinBase(baseUrl, 'audio/map.json')
    const map = await shared(fetcher, mapUrl, () => fetcher(mapUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) }).then(async (response) => {
      if (!response.ok) throw new Error(`audio-map-${response.status}`)
      return response.json() as Promise<AudioMap>
    }))
    const relativeUrl = map.words?.[wordId]?.[locale] ?? map.terms[term]?.[locale]
    if (!relativeUrl) throw new Error('audio-term-missing')
    const url = joinBase(baseUrl, relativeUrl)
    await shared(fetcher, url, async () => {
      const response = await fetcher(url, { cache: 'force-cache', signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error(`audio-file-${response.status}`)
      // Consume the body: headers alone do not mean an MP3 is ready to play.
      const data = await response.arrayBuffer()
      if (data.byteLength < 100) throw new Error('empty-audio')
      const header = new Uint8Array(data, 0, 3)
      const hasId3 = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33
      const hasFrame = header[0] === 0xff && (header[1] & 0xe0) === 0xe0
      if (!hasId3 && !hasFrame) throw new Error('invalid-mp3')
      prepareAudioUrl(url, data)
    })
    // An older native player may have been evicted; rewarm its browser-cached URL.
    // The request cache keeps no ArrayBuffers after preparation.
    prepareAudioUrl(url)
    return { status: 'audio', source: 'local', url }
  } catch {
    return { status: 'device-fallback', locale, reason: 'bundled-audio-unavailable' }
  }
}

export async function assessWordPronunciation(_wordId: string, _locale: Accent, _recording: Blob, _fetcher: typeof fetch = fetch): Promise<AssessmentResult> {
  return { status: 'assessmentUnavailable', reason: 'static-site-local-replay-only', localReplayAvailable: true }
}

export function clearWordAudioRequests() { requests = new WeakMap(); clearPreparedAudio() }
