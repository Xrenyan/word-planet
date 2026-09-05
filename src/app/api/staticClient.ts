import {
  BooksResponseSchema,
  WordsResponseSchema,
  type BooksResponse,
  type WordsResponse,
} from '../../../shared/contracts'
import type { WordPlanetApi } from './client'
import { LocalProgressRepository } from '../progress/LocalProgressRepository'
import { withAbort } from './abort'

type StaticClientOptions = {
  fetcher?: typeof fetch
  baseUrl?: string
  progress?: LocalProgressRepository
}

function normalizeBase(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/`
}

function validBookId(bookId: string) {
  return /^fltrp-nse-2022-g[3-6]-(upper|lower)$/.test(bookId) || /^[a-z0-9][a-z0-9-]*$/i.test(bookId)
}

export function createStaticWordPlanetApi(options: StaticClientOptions = {}): WordPlanetApi {
  const fetcher = options.fetcher ?? fetch
  const baseUrl = normalizeBase(options.baseUrl ?? import.meta.env.BASE_URL)
  const progress = options.progress ?? new LocalProgressRepository()
  let catalogRequest: Promise<BooksResponse> | undefined
  const bookRequests = new Map<string, Promise<WordsResponse>>()

  async function requestJson(path: string) {
    const response = await fetcher(`${baseUrl}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error(`static-data-${response.status}`)
    return response.json()
  }

  function getBook(bookId: string, signal?: AbortSignal) {
    if (!validBookId(bookId) || bookId.includes('..')) return Promise.reject(new Error('invalid-book-id'))
    const cached = bookRequests.get(bookId)
    if (cached) return withAbort(cached, signal)
    const request = requestJson(`data/books/${encodeURIComponent(bookId)}.json`)
      .then((value) => WordsResponseSchema.parse(value))
      .catch((error) => {
        bookRequests.delete(bookId)
        throw error
      })
    bookRequests.set(bookId, request)
    return withAbort(request, signal)
  }

  return {
    getBooks(signal) {
      catalogRequest ??= requestJson('data/catalog.json')
        .then((value) => BooksResponseSchema.parse(value))
        .catch((error) => {
          catalogRequest = undefined
          throw error
        })
      return withAbort(catalogRequest, signal)
    },
    async getWords(bookId, unit, signal) {
      const response = await getBook(bookId, signal)
      return unit ? { bookId: response.bookId, words: response.words.filter((word) => word.unit === unit) } : response
    },
    getProgress(profileId) {
      return progress.getProgress(profileId)
    },
    async getReview(profileId, signal) {
      const [catalog, stats] = await Promise.all([
        this.getBooks(signal),
        Promise.resolve(progress.dueReviewStats(profileId)),
      ])
      if (stats.length === 0) return { profileId, items: [] }
      const books = await Promise.all(catalog.books.map((book) => getBook(book.id, signal)))
      const words = new Map(books.flatMap((book) => book.words).map((word) => [word.id, word]))
      return {
        profileId,
        items: stats.flatMap((stat) => {
          const word = words.get(stat.wordId)
          return word ? [{ word, misses: stat.misses, correct: stat.correct, weakness: stat.weakness, lastAttemptAt: stat.lastAttemptAt, dueAt: stat.dueAt }] : []
        }),
      }
    },
    clearProgress(profileId) {
      return progress.clear(profileId)
    },
    importProgress(contents, profileId) { return progress.importData(contents, profileId) },
  }
}

export const localProgressRepository = new LocalProgressRepository()
export const staticWordPlanetApi = createStaticWordPlanetApi({ progress: localProgressRepository })
