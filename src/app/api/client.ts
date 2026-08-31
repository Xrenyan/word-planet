import type { BooksResponse, ReviewResponse, ServerProgress, WordsResponse } from '../../../shared/contracts'

export type WordPlanetApi = {
  getBooks(signal?: AbortSignal): Promise<BooksResponse>
  getWords(bookId: string, unit?: number, signal?: AbortSignal): Promise<WordsResponse>
  getProgress?(profileId: string, signal?: AbortSignal): Promise<ServerProgress>
  getReview?(profileId: string, signal?: AbortSignal): Promise<ReviewResponse>
  clearProgress?(profileId: string): Promise<{ status: 'cleared'; deletedEvents: number }>
}
