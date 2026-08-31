import { describe, expect, it } from 'vitest'

import type { PublicMatchedGameWord } from '../data/publicMatchedGameWord'
import { demoWords } from '../test/fixtures/gameWords'
import { createMemoryDeck } from './memoryEngine'

describe('createMemoryDeck', () => {
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
