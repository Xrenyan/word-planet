import { describe, expect, it } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import { createDeliverySchedule } from './deliveryEngine'

describe('createDeliverySchedule', () => {
  it('builds a finite canonical schedule only from the exact supplied set', () => {
    const forward = createDeliverySchedule(demoWords, 41, 20)
    const reversed = createDeliverySchedule([...demoWords].reverse(), 41, 20)

    expect(forward).toEqual(reversed)
    expect(forward).toHaveLength(20)
    expect(new Set(forward.flatMap((round) => round.choices.map((choice) => choice.id))))
      .toEqual(new Set(demoWords.map((word) => word.id)))
    expect(Object.isFrozen(forward)).toBe(true)
    expect(Object.isFrozen(forward[0].target.image)).toBe(true)
  })

  it('keeps caller data mutable and rejects unsafe runtime inputs through the shared boundary', () => {
    const caller = structuredClone(demoWords)
    createDeliverySchedule(caller, 3, 2)
    expect(Object.isFrozen(caller)).toBe(false)
    expect(Object.isFrozen(caller[0].image)).toBe(false)

    expect(() => createDeliverySchedule([], 3, 2)).toThrow()
    expect(() => createDeliverySchedule([{ ...demoWords[0], unexpected: true }] as never, 3, 2)).toThrow()
    expect(() => createDeliverySchedule(demoWords, Number.NaN, 2)).toThrow()
    expect(() => createDeliverySchedule(demoWords, 3, 0)).toThrow()
    expect(() => createDeliverySchedule(demoWords, 3, 21)).toThrow()
  })
})
