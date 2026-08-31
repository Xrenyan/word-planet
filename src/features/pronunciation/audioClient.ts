import type { Accent } from '../../pronunciation/voiceCatalog'

export type WordAudioResult =
  | { status: 'audio'; source: 'cloud' | 'cache' | 'local'; url: string }
  | { status: 'device-fallback'; locale: Accent; reason: string }
  | { status: 'unavailable'; reason: string }

type AudioClientDependencies = {
  fetcher?: typeof fetch
  term?: string
  baseUrl?: string
}

type AudioMap = { terms: Record<string, Partial<Record<Accent, string>>> }
let audioMapRequest: Promise<AudioMap> | null = null

type AssessmentResult =
  | { status: 'assessed'; provider: 'azure'; locale: Accent; accuracy: number; fluency: number; completeness: number; pronunciation: number }
  | { status: 'assessmentUnavailable'; reason: string; localReplayAvailable: true }

function joinBase(baseUrl: string, path: string) {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${path.replace(/^\//, '')}`
}

export async function loadWordAudio(_wordId: string, locale: Accent, termOrDependencies: string | AudioClientDependencies = {}): Promise<WordAudioResult> {
  const dependencies = typeof termOrDependencies === 'string' ? { term: termOrDependencies } : termOrDependencies
  const fetcher = dependencies.fetcher ?? fetch
  const baseUrl = dependencies.baseUrl ?? import.meta.env.BASE_URL
  const term = dependencies.term?.toLocaleLowerCase('en').trim()
  if (!term) return { status: 'device-fallback', locale, reason: 'bundled-audio-unavailable' }
  try {
    audioMapRequest ??= fetcher(joinBase(baseUrl, 'audio/map.json'), { headers: { accept: 'application/json' } }).then(async (response) => {
      if (!response.ok) throw new Error(`audio-map-${response.status}`)
      return response.json() as Promise<AudioMap>
    })
    const map = await audioMapRequest
    const relativeUrl = map.terms[term]?.[locale]
    if (!relativeUrl) throw new Error('audio-term-missing')
    const url = joinBase(baseUrl, relativeUrl)
    const audioResponse = await fetcher(url, { cache: 'force-cache' })
    if (!audioResponse.ok) throw new Error(`audio-file-${audioResponse.status}`)
    return { status: 'audio', source: 'local', url }
  } catch {
    audioMapRequest = null
    return { status: 'device-fallback', locale, reason: 'bundled-audio-unavailable' }
  }
}

export async function assessWordPronunciation(_wordId: string, _locale: Accent, _recording: Blob, _fetcher: typeof fetch = fetch): Promise<AssessmentResult> {
  return { status: 'assessmentUnavailable', reason: 'static-site-local-replay-only', localReplayAvailable: true }
}

export function clearWordAudioRequests() { audioMapRequest = null }
