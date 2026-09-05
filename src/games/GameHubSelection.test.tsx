import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BookSummary, VocabularyWordContract } from '../../shared/contracts'
import type { WordPlanetApi } from '../app/api/client'
import { saveBookmark } from '../learning/bookmark'
import { GameHub } from './GameHub'

const books: BookSummary[] = [
  { id: 'g4-upper', label: '四年级上册', grade: 4, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 2 },
  { id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 2 },
]
const words: VocabularyWordContract[] = [
  { id: 'cat', bookId: 'g4-upper', unit: 1, term: 'cat', meaningZh: '猫' },
  { id: 'aunt', bookId: 'g4-upper', unit: 6, term: 'aunt', meaningZh: '姑母' },
  { id: 'apple', bookId: 'g3-upper', unit: 3, term: 'apple', meaningZh: '苹果' },
  { id: 'pear', bookId: 'g3-upper', unit: 8, term: 'pear', meaningZh: '梨' },
].map((word, index) => ({ ...word, order: index + 1, ipaUk: '/test/', ipaUs: '/test/', image: { src: `/${word.term}.webp`, alt: word.term, license: 'reviewed' }, source: { title: 'public source', url: 'https://example.test', page: 1 }, sourceConfidence: 'public-secondary' }))

const progressRecorder = { record: async () => 'saved' as const }
const responseFor = (bookId: string) => ({ bookId, words: words.filter(word => word.bookId === bookId) })
function createApi(overrides: Partial<WordPlanetApi> = {}): WordPlanetApi {
  return { getBooks: async () => ({ books }), getWords: async bookId => responseFor(bookId), ...overrides }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('GameHub selection', () => {
  it('starts games in the bookmarked word unit', async () => {
    const user = userEvent.setup()
    saveBookmark({ bookId: 'g4-upper', wordId: 'aunt' })
    render(<GameHub api={createApi()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('1 个单词 · 随机出题')
    expect(screen.getByLabelText('教材')).toHaveValue('g4-upper')
    expect(screen.getByLabelText('单元')).toHaveValue('6')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    expect(screen.getByTestId('bubble-target')).toHaveAttribute('data-word-id', 'aunt')
  })

  it('selects an available first unit when switching to a book without unit one', async () => {
    const user = userEvent.setup()
    render(<GameHub api={createApi()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('1 个单词 · 随机出题')
    await user.selectOptions(screen.getByLabelText('教材'), 'g3-upper')
    expect(await screen.findByText('1 个单词 · 随机出题')).toBeVisible()
    expect(screen.getByLabelText('单元')).toHaveValue('3')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    expect(screen.getByTestId('bubble-target')).toHaveAttribute('data-word-id', 'apple')
  })

  it('preserves a valid manually selected unit when retrying a failed load', async () => {
    const user = userEvent.setup()
    saveBookmark({ bookId: 'g4-upper', wordId: 'cat' })
    const view = render(<GameHub api={createApi()} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await screen.findByText('1 个单词 · 随机出题')
    await user.selectOptions(screen.getByLabelText('单元'), '6')
    const retryApi = createApi({ getWords: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(responseFor('g4-upper')) })
    view.rerender(<GameHub api={retryApi} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '再试一次' }))
    await screen.findByText('1 个单词 · 随机出题')
    expect(screen.getByLabelText('单元')).toHaveValue('6')
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    expect(screen.getByTestId('bubble-target')).toHaveAttribute('data-word-id', 'aunt')
  })

  it.each(['success', 'failure'] as const)('ignores stale word request %s after changing books', async (outcome) => {
    const user = userEvent.setup()
    const stale = deferred<ReturnType<typeof responseFor>>()
    const current = deferred<ReturnType<typeof responseFor>>()
    const request = vi.fn((bookId: string) => bookId === 'g4-upper' ? stale.promise : current.promise)
    render(<GameHub api={createApi({ getWords: request })} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await waitFor(() => expect(request).toHaveBeenCalled())
    await user.selectOptions(screen.getByLabelText('教材'), 'g3-upper')
    await act(async () => {
      if (outcome === 'success') stale.resolve(responseFor('g4-upper'))
      else stale.reject(new Error('old request failed'))
    })
    expect(screen.getByRole('button', { name: '开始泡泡找单词' })).toBeDisabled()
    expect(screen.queryByText('单词还没准备好')).not.toBeInTheDocument()
    expect(screen.getAllByText('正在准备单词…').length).toBeGreaterThan(0)
    await act(async () => current.resolve(responseFor('g3-upper')))
    expect(screen.getByLabelText('教材')).toHaveValue('g3-upper')
    expect(screen.getByLabelText('单元')).toHaveValue('3')
    expect(screen.getByText('1 个单词 · 随机出题')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    expect(screen.getByTestId('bubble-target')).toHaveAttribute('data-word-id', 'apple')
  })

  it.each(['success', 'failure'] as const)('ignores stale book request %s after the API changes', async (outcome) => {
    const stale = deferred<{ books: BookSummary[] }>()
    const current = deferred<{ books: BookSummary[] }>()
    const view = render(<GameHub api={createApi({ getBooks: () => stale.promise })} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    view.rerender(<GameHub api={createApi({ getBooks: () => current.promise })} progressRecorder={progressRecorder} onReturnToLearning={vi.fn()} />)
    await act(async () => {
      if (outcome === 'success') stale.resolve({ books: [books[0]] })
      else stale.reject(new Error('old request failed'))
    })
    expect(screen.getByText('正在准备单词…')).toBeVisible()
    expect(screen.queryByText('单词还没准备好')).not.toBeInTheDocument()
    await act(async () => current.resolve({ books: [books[1]] }))
    expect(screen.getByLabelText('教材')).toHaveValue('g3-upper')
    expect(screen.queryByRole('option', { name: '四年级上册' })).not.toBeInTheDocument()
    expect(screen.queryByText('单词还没准备好')).not.toBeInTheDocument()
  })
})
