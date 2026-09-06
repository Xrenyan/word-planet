import { describe, expect, it } from 'vitest'

import type { PublicMatchedGameWord } from '../data/publicMatchedGameWord'
import { demoWords } from '../test/fixtures/gameWords'
import { createMemoryDeck } from './memoryEngine'

describe('createMemoryDeck', () => {
  it.each([2, 3, 4] as const)('supports a %i-group challenge without inventing missing source words', groups => {
    expect(createMemoryDeck(demoWords, 21, groups)).toHaveLength(groups * 3)
    expect(createMemoryDeck(demoWords.slice(0, 1), 21, groups)).toHaveLength(3)
  })

  it.each([0, 1, 5, 2.5, Number.NaN])('rejects invalid challenge group count %s', groups => {
    expect(() => createMemoryDeck(demoWords, 21, groups as 2)).toThrow(/group/i)
  })

  it('limits a large textbook unit to four distinct groups instead of an unmanageable wall of cards', () => {
    const words = Array.from({length: 30}, (_, i) => ({...demoWords[0], id: `demo-word-${i}`, term: `word${i}`}))
    const deck = createMemoryDeck(words, 21)
    expect(deck).toHaveLength(12)
    expect(new Set(deck.map(card => card.wordId)).size).toBe(4)
    expect(new Set(createMemoryDeck(words, 99).map(card => card.wordId))).not.toEqual(new Set(deck.map(card => card.wordId)))
  })
  it('creates exactly one image, English and Chinese card for every supplied word', () => {
    const supplied = demoWords.slice(0, 3)
    const deck = createMemoryDeck(supplied, 17)

    expect(deck).toHaveLength(9)
    expect(new Set(deck.map((card) => card.id))).toHaveProperty('size', 9)
    expect(new Set(deck.map((card) => card.wordId))).toEqual(new Set(supplied.map((word) => word.id)))
    for (const word of supplied) {
      const cards = deck.filter((card) => card.wordId === word.id)
      expect(cards.map((card) => card.kind).sort()).toEqual(['image', 'meaning', 'term'])
      expect(cards.find((card) => card.kind === 'image')).toMatchObject({ image: word.image })
      expect(cards.find((card) => card.kind === 'term')).toMatchObject({ text: word.term })
      expect(cards.find((card) => card.kind === 'meaning')).toMatchObject({ text: word.meaningZh })
    }
  })

  it('is deterministic, canonical across reversed input, deeply frozen and caller nonmutating', () => {
    const supplied = demoWords.slice(0, 4).map((word) => structuredClone(word))
    const original = structuredClone(supplied)
    const first = createMemoryDeck(supplied, 29)
    const second = createMemoryDeck([...supplied].reverse(), 29)

    expect(first).toEqual(second)
    expect(supplied).toEqual(original)
    expect(Object.isFrozen(supplied)).toBe(false)
    expect(Object.isFrozen(first)).toBe(true)
    expect(first.every(Object.isFrozen)).toBe(true)
    const imageCard = first.find((card) => card.kind === 'image')!
    expect(Object.isFrozen(imageCard.image)).toBe(true)
  })

  it('keeps card ids collision-safe even when word ids contain separators', () => {
    const unusual = [
      { ...demoWords[0], id: 'demo-a' },
      { ...demoWords[1], id: 'demo-a::term' },
    ] satisfies PublicMatchedGameWord[]
    const deck = createMemoryDeck(unusual, 3)
    expect(new Set(deck.map((card) => card.id))).toHaveProperty('size', 6)
  })

  it('rejects invalid words and seeds through the shared strict game boundary', () => {
    expect(() => createMemoryDeck([], 1)).toThrow()
    expect(() => createMemoryDeck([demoWords[0], demoWords[0]], 1)).toThrow()
    expect(() => createMemoryDeck([{ ...demoWords[0], meaningZh: '' }], 1)).toThrow()
    expect(() => createMemoryDeck([{ ...demoWords[0], surprise: true }], 1)).toThrow()
    expect(() => createMemoryDeck(demoWords, -1)).toThrow()
    expect(() => createMemoryDeck(demoWords, 1.5)).toThrow()
    expect(() => createMemoryDeck(demoWords, Number.NaN)).toThrow()
    expect(() => createMemoryDeck(demoWords, Number.POSITIVE_INFINITY)).toThrow()
  })
})
