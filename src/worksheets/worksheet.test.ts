import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../app/api/client'
import { generateWorksheet } from './worksheet'

const words = ['apple', 'book', 'cat'].map((term, index) => ({
  id: `w${index + 1}`, bookId: 'book-3a', unit: 1, order: index + 1, term,
  meaningZh: ['苹果', '书', '猫'][index], ipaUk: '/x/', ipaUs: '/x/',
  image: { src: `https://example.com/${term}.jpg`, alt: term, license: 'source-linked:test' },
  source: { title: 'source', url: 'https://example.com', page: 1 },
  sourceConfidence: 'public-secondary' as const,
}))

describe('generateWorksheet', () => {
  it('creates the requested deterministic unit worksheet and answer sheet', async () => {
    const api = { getWords: vi.fn(async () => ({ bookId: 'book-3a', words })) } as unknown as WordPlanetApi

    const first = await generateWorksheet(api, { bookId: 'book-3a', unit: 1, count: 2, seed: 'child-1' })
    const second = await generateWorksheet(api, { bookId: 'book-3a', unit: 1, count: 2, seed: 'child-1' })

    expect(first).toEqual(second)
    expect(first.questions).toHaveLength(2)
    expect(first.answers.map((answer) => answer.answer)).toEqual(first.questions.map((question) => words.find((word) => word.id === question.wordId)?.term))
    expect(first.source).toEqual({ bookId: 'book-3a', unit: 1, contentStatus: 'source-matched' })
  })

  it('rejects impossible counts instead of padding with fake words', async () => {
    const api = { getWords: vi.fn(async () => ({ bookId: 'book-3a', words })) } as unknown as WordPlanetApi

    await expect(generateWorksheet(api, { bookId: 'book-3a', unit: 1, count: 4, seed: 'child-1' })).rejects.toThrow('worksheet-count-exceeds-unit')
  })
})
