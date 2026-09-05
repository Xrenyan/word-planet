import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LocalProgressRepository } from '../progress/LocalProgressRepository'
import { createStaticWordPlanetApi } from './staticClient'
import { BooksResponseSchema, WordsResponseSchema } from '../../../shared/contracts'

describe('static curriculum client', () => {
  it('isolates cancellation between concurrent catalog readers', async () => {
    let respond!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { respond = resolve }))
    const api = createStaticWordPlanetApi({ fetcher: fetcher as typeof fetch })
    const controller = new AbortController()
    const first = api.getBooks(controller.signal)
    const second = api.getBooks()
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    respond(new Response(JSON.stringify({ books: [] })))
    await rejected
    await expect(second).resolves.toEqual({ books: [] })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('replaces grade four in the same eight-book catalog and preserves the photo unit boundaries', () => {
    const catalog = JSON.parse(readFileSync(resolve('public/data/catalog.json'), 'utf8')) as { books: Array<{ label: string; availableWordCount: number }> }
    expect(catalog.books.map((book) => book.label)).toEqual([
      '三年级上册', '三年级下册', '四年级上册', '四年级下册',
      '五年级上册', '五年级下册', '六年级上册', '六年级下册',
    ])
    expect(catalog.books.reduce((total, book) => total + book.availableWordCount, 0)).toBe(1195)
    const photo = WordsResponseSchema.parse(JSON.parse(readFileSync(resolve('public/data/books/fltrp-nse-2022-g4-upper.json'), 'utf8')))
    expect([1,2,3,4,5,6].map(unit => photo.words.filter(word => word.unit === unit).length)).toEqual([31,40,27,19,26,22])
    expect(photo.words[0].term).toBe('sport')
    expect(photo.words.at(-1)?.term).toBe('aunt')
    expect(photo.words.every(word => word.sourceConfidence === 'user-photo')).toBe(true)
  })

  it('validates every bundled book with the same contract as the running application', () => {
    const { books } = BooksResponseSchema.parse(JSON.parse(readFileSync(resolve('public/data/catalog.json'), 'utf8')))
    for (const book of books) {
      const content = WordsResponseSchema.parse(JSON.parse(readFileSync(resolve(`public/data/books/${book.id}.json`), 'utf8')))
      expect(content.words).toHaveLength(book.availableWordCount!)
      for (const word of content.words) {
        if (!word.image.src.startsWith('word-art/')) continue
        const image = readFileSync(resolve('public', word.image.src))
        if (word.image.src.endsWith('.svg')) expect(image.toString('utf8')).toContain('<svg')
        else {
          expect(word.image.src).toMatch(/\.webp$/)
          expect(image.toString('ascii', 0, 4)).toBe('RIFF')
          expect(image.toString('ascii', 8, 12)).toBe('WEBP')
          expect(image.readUInt32LE(4) + 8).toBe(image.length)
        }
      }
    }
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

    expect(review?.items).toEqual([{ word, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 100, dueAt: 100 }])
  })
})
