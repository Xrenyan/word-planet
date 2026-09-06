import type { WordImage } from '../curriculum/types'
import { createGameRound, type GameWord } from './engine'

export type MemoryCard = Readonly<
  | { id: string; wordId: string; kind: 'image'; image: WordImage }
  | { id: string; wordId: string; kind: 'term' | 'meaning'; text: string }
>

const CARD_KINDS = ['image', 'term', 'meaning'] as const

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function nextRandom(seed: number): readonly [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return [next, ((value ^ (value >>> 14)) >>> 0) / 4294967296]
}

function shuffle<T>(values: readonly T[], seed: number): readonly T[] {
  const result = [...values]
  let cursor = seed >>> 0
  for (let index = result.length - 1; index > 0; index -= 1) {
    const [next, random] = nextRandom(cursor)
    cursor = next
    const swapIndex = Math.floor(random * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/** Builds a canonical, deterministic three-card set through the Task 9 truth boundary. */
export function createMemoryDeck(words: readonly GameWord[] | unknown, seed: number, groups: 2 | 3 | 4 = 4): readonly MemoryCard[] {
  if (![2, 3, 4].includes(groups)) throw new Error('memory group count must be 2, 3 or 4')
  const validated = shuffle(createGameRound(words, seed).sourceWords, seed).slice(0, groups)
  const cards = validated.flatMap((word): MemoryCard[] =>
    CARD_KINDS.map((kind) => {
      const base = { id: JSON.stringify([word.id, kind]), wordId: word.id }
      if (kind === 'image') return { ...base, kind, image: structuredClone(word.image) }
      return { ...base, kind, text: kind === 'term' ? word.term : word.meaningZh }
    }),
  )
  return deepFreeze(structuredClone(shuffle(cards, seed)))
}
