import { describe, expect, it, vi } from 'vitest'

import { findVoice } from './voiceCatalog'
import { createSpeechController, disposeSharedSpeechController, speakWord } from './speech'

const ukVoice = { name: 'UK voice', lang: 'en-GB' } as SpeechSynthesisVoice
const usVoice = { name: 'US voice', lang: 'en-US' } as SpeechSynthesisVoice

describe('findVoice', () => {
  it('does not substitute a US voice when the UK voice is missing', () => {
    expect(findVoice('en-GB', [usVoice])).toEqual({ status: 'unavailable' })
  })

  it('does not substitute a UK voice when the US voice is missing', () => {
    expect(findVoice('en-US', [ukVoice])).toEqual({ status: 'unavailable' })
  })
})

describe('speakWord', () => {
  it('uses the exact requested accent and a requested child-safe rate', async () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const utterance = { rate: 1, lang: '', voice: null as SpeechSynthesisVoice | null, onend: null as (() => void) | null, onerror: null as (() => void) | null }
    synthesis.speak.mockImplementation(() => utterance.onend?.())

    await expect(speakWord('planet', 'en-GB', 0.72, {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice, usVoice],
      createUtterance: () => utterance as unknown as SpeechSynthesisUtterance,
    })).resolves.toEqual({ status: 'spoken', accent: 'en-GB', rate: 0.72 })

    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(utterance.voice).toBe(ukVoice)
    expect(utterance.lang).toBe('en-GB')
    expect(utterance.rate).toBe(0.72)
  })

  it('uses the US voice at the normal rate without falling back', async () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const utterance = { rate: 1, lang: '', voice: null as SpeechSynthesisVoice | null, onend: null as (() => void) | null, onerror: null as (() => void) | null }
    synthesis.speak.mockImplementation(() => utterance.onend?.())

    await speakWord('planet', 'en-US', 1, {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice, usVoice],
      createUtterance: () => utterance as unknown as SpeechSynthesisUtterance,
    })

    expect(utterance.voice).toBe(usVoice)
    expect(utterance.lang).toBe('en-US')
    expect(utterance.rate).toBe(1)
  })

  it('reports unsupported, unavailable, invalid, and utterance-error states honestly', async () => {
    await expect(speakWord('planet', 'en-GB', 1, { synthesis: null, voices: [ukVoice] }))
      .resolves.toEqual({ status: 'unsupported' })
    await expect(speakWord('planet', 'en-GB', 1, {
      synthesis: { cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis,
      voices: [usVoice],
    }))
      .resolves.toEqual({ status: 'unavailable', accent: 'en-GB' })
    await expect(speakWord('   ', 'en-GB', 1, { synthesis: {} as SpeechSynthesis, voices: [ukVoice] }))
      .resolves.toEqual({ status: 'invalid-term' })
    await expect(speakWord('planet', 'en-GB', Number.NaN, { synthesis: {} as SpeechSynthesis, voices: [ukVoice] }))
      .resolves.toEqual({ status: 'invalid-rate' })

    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const utterance = { rate: 1, lang: '', voice: null as SpeechSynthesisVoice | null, onend: null as (() => void) | null, onerror: null as ((event: SpeechSynthesisErrorEvent) => void) | null }
    synthesis.speak.mockImplementation(() => utterance.onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent))
    await expect(speakWord('planet', 'en-GB', 1, {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice],
      createUtterance: () => utterance as unknown as SpeechSynthesisUtterance,
    })).resolves.toEqual({ status: 'error' })
  })

  it('settles a replaced request and never lets a stale completion replace the newest request', async () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null; rate: number; lang: string; voice: SpeechSynthesisVoice | null }> = []
    const controller = createSpeechController({
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice],
      createUtterance: () => {
        const utterance = { onend: null, onerror: null, rate: 1, lang: '', voice: null }
        utterances.push(utterance)
        return utterance as unknown as SpeechSynthesisUtterance
      },
    })

    const first = controller.speak('planet', 'en-GB', 1)
    const newest = controller.speak('planet', 'en-GB', 0.72)
    utterances[0].onend?.()
    utterances[1].onend?.()

    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(newest).resolves.toEqual({ status: 'spoken', accent: 'en-GB', rate: 0.72 })
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)
  })

  it('makes consecutive direct speakWord calls replace the earlier request within the same synthesis scope', async () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const utterances: Array<{ onend: (() => void) | null; onerror: (() => void) | null; rate: number; lang: string; voice: SpeechSynthesisVoice | null }> = []
    const createUtterance = () => {
      const utterance = { onend: null, onerror: null, rate: 1, lang: '', voice: null }
      utterances.push(utterance)
      return utterance as unknown as SpeechSynthesisUtterance
    }
    const dependencies = {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice],
      createUtterance,
    }

    const first = speakWord('planet', 'en-GB', 1, dependencies)
    const newest = speakWord('planet', 'en-GB', 0.72, dependencies)
    utterances[0].onend?.()
    utterances[1].onend?.()

    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(newest).resolves.toEqual({ status: 'spoken', accent: 'en-GB', rate: 0.72 })
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)
  })

  it('replaces a shared scope when later direct calls provide different voice or utterance overrides', async () => {
    const synthesis = { cancel: vi.fn(), speak: vi.fn() }
    const ukUtterance = { onend: null as (() => void) | null, onerror: null as (() => void) | null, rate: 1, lang: '', voice: null as SpeechSynthesisVoice | null }
    const usUtterance = { onend: null as (() => void) | null, onerror: null as (() => void) | null, rate: 1, lang: '', voice: null as SpeechSynthesisVoice | null }
    const makeUk = vi.fn(() => ukUtterance as unknown as SpeechSynthesisUtterance)
    const makeUs = vi.fn(() => usUtterance as unknown as SpeechSynthesisUtterance)

    const first = speakWord('planet', 'en-GB', 1, {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [ukVoice],
      createUtterance: makeUk,
    })
    const second = speakWord('planet', 'en-US', 1, {
      synthesis: synthesis as unknown as SpeechSynthesis,
      voices: [usVoice],
      createUtterance: makeUs,
    })
    usUtterance.onend?.()

    await expect(first).resolves.toEqual({ status: 'cancelled' })
    await expect(second).resolves.toEqual({ status: 'spoken', accent: 'en-US', rate: 1 })
    expect(makeUs).toHaveBeenCalledOnce()
    expect(usUtterance.voice).toBe(usVoice)
  })

  it('explicitly disposes one direct-call synthesis scope without affecting another injected synthesis', async () => {
    const firstSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    const secondSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    const makeUtterance = () => ({ onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance
    const first = speakWord('planet', 'en-GB', 1, { synthesis: firstSynthesis as unknown as SpeechSynthesis, voices: [ukVoice], createUtterance: makeUtterance })
    const second = speakWord('planet', 'en-GB', 1, { synthesis: secondSynthesis as unknown as SpeechSynthesis, voices: [ukVoice], createUtterance: makeUtterance })

    disposeSharedSpeechController(firstSynthesis as unknown as SpeechSynthesis)
    await expect(first).resolves.toEqual({ status: 'cancelled' })
    expect(firstSynthesis.cancel).toHaveBeenCalled()
    expect(secondSynthesis.cancel).toHaveBeenCalledOnce()

    disposeSharedSpeechController(secondSynthesis as unknown as SpeechSynthesis)
    await expect(second).resolves.toEqual({ status: 'cancelled' })
  })

  it('converts voice enumeration and utterance-construction throws into honest results', async () => {
    await expect(speakWord('planet', 'en-GB', 1, {
      synthesis: { cancel: vi.fn(), speak: vi.fn(), getVoices: () => { throw new Error('voices') } } as unknown as SpeechSynthesis,
    })).resolves.toEqual({ status: 'error' })
    await expect(speakWord('planet', 'en-GB', 1, {
      synthesis: { cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis,
      voices: [ukVoice],
      createUtterance: () => { throw new Error('utterance') },
    })).resolves.toEqual({ status: 'error' })
  })

  it('settles a standalone utterance that never emits an end or error event', async () => {
    vi.useFakeTimers()
    try {
      const result = speakWord('planet', 'en-GB', 1, {
        synthesis: { cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis,
        voices: [ukVoice],
        createUtterance: () => ({ onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance,
      })
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(result).resolves.toEqual({ status: 'error' })
    } finally {
      vi.useRealTimers()
    }
  })
})
