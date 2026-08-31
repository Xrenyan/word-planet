import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LocalProgressRepository } from '../progress/LocalProgressRepository'
import { createStaticWordPlanetApi } from './staticClient'

describe('static curriculum client', () => {
  it('ships all eight books and exactly 1175 source-matched words', () => {
    const catalog = JSON.parse(readFileSync(resolve('public/data/catalog.json'), 'utf8')) as { books: Array<{ label: string; availableWordCount: number }> }
    expect(catalog.books.map((book) => book.label)).toEqual([
      '三年级上册', '三年级下册', '四年级上册', '四年级下册',
      '五年级上册', '五年级下册', '六年级上册', '六年级下册',
    ])
    expect(catalog.books.reduce((total, book) => total + book.availableWordCount, 0)).toBe(1175)
  })

  it('loads a book beneath the configured Pages base and filters by unit', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({
      bookId: 'book-3a',
      words: [
        { id: 'w1', bookId: 'book-3a', unit: 1, order: 1, term: 'hello', meaningZh: '你好', ipaUk: '/həˈləʊ/', ipaUs: '/həˈloʊ/', image: { src: 'https://example.com/hello.jpg', alt: 'hello', license: 'source-linked:test' }, source: { title: 'source', url: 'https://example.com', page: 1 }, sourceConfidence: 'public-secondary' },
        { id: 'w2', bookId: 'book-3a', unit: 2, order: 1, term: 'book', meaningZh: '书', ipaUk: '/bʊk/', ipaUs: '/bʊk/', image: { src: 'https://example.com/book.jpg', alt: 'book', license: 'source-linked:test' }, source: { title: 'source', url: 'https://example.com', page: 1 }, sourceConfidence: 'public-secondary' },
      ],
    }), { headers: { 'content-type': 'application/json' } }))
    const api = createStaticWordPlanetApi({ fetcher: fetcher as unknown as typeof fetch, baseUrl: '/word-planet/' })

    const response = await api.getWords('book-3a', 2)

    expect(fetcher).toHaveBeenCalledWith('/word-planet/data/books/book-3a.json', expect.objectContaining({ headers: { accept: 'application/json' } }))
    expect(response.words.map((word) => word.term)).toEqual(['book'])
  })

  it('rejects an unknown or unsafe book id without making a request', async () => {
    const fetcher = vi.fn()
    const api = createStaticWordPlanetApi({ fetcher: fetcher as unknown as typeof fetch, baseUrl: '/word-planet/' })

    await expect(api.getWords('../private')).rejects.toThrow('invalid-book-id')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('hydrates a device-local review item from the matching static word', async () => {
    const word = { id: 'w1', bookId: 'book-3a', unit: 1, order: 1, term: 'hello', meaningZh: '你好', ipaUk: '/həˈləʊ/', ipaUs: '/həˈloʊ/', image: { src: 'https://example.com/hello.jpg', alt: 'hello', license: 'source-linked:test' }, source: { title: 'source', url: 'https://example.com', page: 1 }, sourceConfidence: 'public-secondary' as const }
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('catalog.json')
      ? { books: [{ id: 'book-3a', label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 1 }] }
      : { bookId: 'book-3a', words: [word] })))
    const progress = new LocalProgressRepository({ storage: null })
    await progress.record({ id: 'miss-1', profileId: 'local-child', wordId: 'w1', outcome: 'missed', source: 'spelling', occurredAt: 100 })
    const api = createStaticWordPlanetApi({ fetcher: fetcher as unknown as typeof fetch, baseUrl: '/word-planet/', progress })

    const review = await api.getReview?.('local-child')

    expect(review?.items).toEqual([{ word, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 100 }])
  })
})
