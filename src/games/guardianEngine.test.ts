import { describe, expect, it } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { createGuardianStages, validateGuardianStages } from './guardianEngine'

describe('createGuardianStages', () => {
  it('creates exactly three deterministic ordered modes from the canonical caller set', () => {
    const stages = createGuardianStages(demoWords, 73)
    const reversed = createGuardianStages([...demoWords].reverse(), 73)

    expect(stages).toEqual(reversed)
    expect(stages.map((stage) => stage.mode)).toEqual(['picture-choice', 'audio-choice', 'spelling'])
    expect(new Set(stages.map((stage) => stage.id)).size).toBe(3)
    expect(stages.every((stage) => stage.round.sourceWords.length === demoWords.length)).toBe(true)
    expect(stages.every((stage) => stage.round.choices.every((choice) => demoWords.some((word) => word.id === choice.id)))).toBe(true)
  })

  it('is deeply immutable without freezing or changing caller-owned words', () => {
    const caller = structuredClone(demoWords)
    const stages = createGuardianStages(caller, 9)

    expect(Object.isFrozen(caller)).toBe(false)
    expect(Object.isFrozen(caller[0].image)).toBe(false)
    expect(Object.isFrozen(stages)).toBe(true)
    expect(Object.isFrozen(stages[0].round.sourceWords[0].image)).toBe(true)
    expect(() => { (stages[0].round.target.image as { alt: string }).alt = 'forged' }).toThrow()
  })

  it('rejects empty, duplicate, malformed, mixed, unverified and invalid-seed input', () => {
    expect(() => createGuardianStages([], 1)).toThrow()
    expect(() => createGuardianStages([demoWords[0], { ...demoWords[1], id: demoWords[0].id }], 1)).toThrow()
    expect(() => createGuardianStages([{ ...demoWords[0], ipaUk: '' }] as never, 1)).toThrow()
    expect(() => createGuardianStages([demoWords[0], { id: 'formal', reviewStatus: 'verified' }] as never, 1)).toThrow()
    expect(() => createGuardianStages(demoWords, -1)).toThrow()
    expect(() => createGuardianStages(demoWords, 1.5)).toThrow()
  })
})

describe('validateGuardianStages', () => {
  it('reconstructs valid content and returns a detached frozen snapshot', () => {
    const caller = structuredClone(createGuardianStages(demoWords, 17))
    const validated = validateGuardianStages(caller)

    expect(validated).toEqual(caller)
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(caller)).toBe(false)
  })

  it('rejects forged identity, target, choices, order and incomplete stage lists', () => {
    const valid = structuredClone(createGuardianStages(demoWords, 17))
    const alternate = valid[0].round.choices.find((choice) => choice.id !== valid[0].round.target.id)!

    expect(() => validateGuardianStages(valid.slice(0, 2))).toThrow()
    expect(() => validateGuardianStages(valid.map((stage, index) => index === 0 ? { ...stage, id: 'forged' } : stage))).toThrow()
    expect(() => validateGuardianStages(valid.map((stage, index) => index === 0 ? { ...stage, round: { ...stage.round, target: alternate } } : stage))).toThrow()
    expect(() => validateGuardianStages(valid.map((stage, index) => index === 1 ? { ...stage, round: { ...stage.round, choices: [...stage.round.choices].reverse() } } : stage))).toThrow()
    expect(() => validateGuardianStages([...valid].reverse())).toThrow()
  })
})
