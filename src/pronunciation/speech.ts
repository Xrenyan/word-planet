import { findVoice, type Accent } from './voiceCatalog'

export type SpeechResult =
  | { status: 'spoken'; accent: Accent; rate: number }
  | { status: 'unavailable'; accent: Accent }
  | { status: 'unsupported' }
  | { status: 'invalid-term' }
  | { status: 'invalid-rate' }
  | { status: 'cancelled' }
  | { status: 'error' }

export type SpeechDependencies = {
  synthesis?: SpeechSynthesis | null
  voices?: readonly SpeechSynthesisVoice[]
  createUtterance?: (term: string) => SpeechSynthesisUtterance
}

export type SpeechController = {
  speak: (term: string, accent: Accent, rate: number) => Promise<SpeechResult>
  dispose: () => void
}

const MIN_SAFE_RATE = 0.5
const MAX_SAFE_RATE = 1.25
type SharedControllerEntry = {
  controller: SpeechController
  voices: SpeechDependencies['voices']
  createUtterance: SpeechDependencies['createUtterance']
}
const sharedControllers = new WeakMap<SpeechSynthesis, SharedControllerEntry>()

function browserSynthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null
}

function createBrowserUtterance(term: string): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !window.SpeechSynthesisUtterance) return null
  return new window.SpeechSynthesisUtterance(term)
}

function isSafeRate(rate: number) {
  return Number.isFinite(rate) && rate >= MIN_SAFE_RATE && rate <= MAX_SAFE_RATE
}

type ActiveSpeech = {
  resolve: (result: SpeechResult) => void
  timeout: ReturnType<typeof setTimeout>
}

/** Owns one Web Speech request at a time and settles cancelled requests itself. */
export function createSpeechController(dependencies: SpeechDependencies = {}): SpeechController {
  const synthesis = dependencies.synthesis === undefined ? browserSynthesis() : dependencies.synthesis
  let active: ActiveSpeech | null = null
  let disposed = false

  function settleActive(result: SpeechResult) {
    const request = active
    active = null
    if (request) {
      clearTimeout(request.timeout)
      request.resolve(result)
    }
  }

  function cancelCurrent() {
    settleActive({ status: 'cancelled' })
    try {
      synthesis?.cancel?.()
      return true
    } catch {
      return false
    }
  }

  return {
    speak(term, accent, rate) {
      if (disposed) return Promise.resolve({ status: 'cancelled' })
      if (!term.trim()) return Promise.resolve({ status: 'invalid-term' })
      if (!isSafeRate(rate)) return Promise.resolve({ status: 'invalid-rate' })
      if (!synthesis || typeof synthesis.speak !== 'function' || typeof synthesis.cancel !== 'function') {
        return Promise.resolve({ status: 'unsupported' })
      }

      if (!cancelCurrent()) return Promise.resolve({ status: 'error' })
      let voices: readonly SpeechSynthesisVoice[]
      try {
        voices = dependencies.voices ?? synthesis.getVoices?.() ?? []
      } catch {
        return Promise.resolve({ status: 'error' })
      }
      const found = findVoice(accent, voices)
      if (found.status === 'unavailable') return Promise.resolve({ status: 'unavailable', accent })

      let utterance: SpeechSynthesisUtterance | null
      try {
        utterance = dependencies.createUtterance?.(term) ?? createBrowserUtterance(term)
      } catch {
        return Promise.resolve({ status: 'error' })
      }
      if (!utterance) return Promise.resolve({ status: 'unsupported' })

      utterance.voice = found.voice
      utterance.lang = accent
      utterance.rate = rate
      return new Promise<SpeechResult>((resolve) => {
        const request: ActiveSpeech = {
          resolve,
          timeout: setTimeout(() => {
            if (active !== request) return
            try { synthesis.cancel() } catch { /* settle the request regardless */ }
            settleActive({ status: 'error' })
          }, 15_000),
        }
        active = request
        utterance.onend = () => {
          if (active === request) settleActive({ status: 'spoken', accent, rate })
        }
        utterance.onerror = () => {
          if (active === request) settleActive({ status: 'error' })
        }
        try {
          synthesis.speak(utterance)
        } catch {
          if (active === request) settleActive({ status: 'error' })
        }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelCurrent()
    },
  }
}

export function speakWord(term: string, accent: Accent, rate: number, dependencies: SpeechDependencies = {}) {
  const synthesis = dependencies.synthesis === undefined ? browserSynthesis() : dependencies.synthesis
  if (!synthesis) return createSpeechController({ ...dependencies, synthesis }).speak(term, accent, rate)

  let entry = sharedControllers.get(synthesis)
  const overridesMatch = entry &&
    entry.voices === dependencies.voices &&
    entry.createUtterance === dependencies.createUtterance
  if (!overridesMatch) {
    entry?.controller.dispose()
    entry = {
      controller: createSpeechController({ ...dependencies, synthesis }),
      voices: dependencies.voices,
      createUtterance: dependencies.createUtterance,
    }
    sharedControllers.set(synthesis, entry)
  }
  return entry!.controller.speak(term, accent, rate)
}

/** Releases the shared direct-call scope for a synthesis engine when needed. */
export function disposeSharedSpeechController(synthesis: SpeechSynthesis | null | undefined = browserSynthesis()) {
  if (!synthesis) return
  const entry = sharedControllers.get(synthesis)
  entry?.controller.dispose()
  sharedControllers.delete(synthesis)
}

export const speechRates = Object.freeze({ normal: 1, slow: 0.72 })
