import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewItem, VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { ReviewCenter } from './ReviewCenter'

const apple: VocabularyWordContract = {
  id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果',
  ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/',
  image: { src: '/apple.webp', alt: '一个红苹果', license: 'reviewed' },
  source: { title: 'source', url: 'https://example.test', page: 1 },
}

describe('ReviewCenter', () => {
  it('starts only the selected review category and offers a way out of an empty filter', async () => {
    const user = userEvent.setup()
    const missed = { word: apple, misses: 2, correct: 1, weakness: 1, lastAttemptAt: 300 }
    const due = { word: { ...apple, id: 'pear', term: 'pear', meaningZh: '梨' }, misses: 0, correct: 1, weakness: 0, lastAttemptAt: 100, dueAt: 200 }
    const onReview = vi.fn()
    const api = { getReview: async () => ({ profileId: 'local-child', items: [missed, due] }) } as unknown as WordPlanetApi
    const view = render(<ReviewCenter api={api} onReview={onReview} />)
    await user.click(await screen.findByRole('button', { name: '到期复习 1' }))
    expect(screen.queryByRole('heading', { name: 'apple' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'pear' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '练这 1 个' }))
    expect(onReview).toHaveBeenCalledWith([due])
    await user.click(screen.getByRole('button', { name: '再练错词 1' }))
    await user.click(screen.getByRole('button', { name: '练这 1 个' }))
    expect(onReview).toHaveBeenLastCalledWith([missed])
    view.rerender(<ReviewCenter api={{ ...api, getReview: async () => ({ profileId: 'local-child', items: [due] }) }} onReview={onReview} />)
    await user.click(await screen.findByRole('button', { name: '查看全部复习词' }))
    expect(screen.getByRole('heading', { name: 'pear' })).toBeVisible()
  })

  it('ignores an old review response after a new request has already rendered', async () => {
    let finish!: (result: { profileId: string; items: ReviewItem[] }) => void
    const oldApi = { getReview: () => new Promise(resolve => { finish = resolve }) } as unknown as WordPlanetApi
    const newApi = { getReview: async () => ({ profileId: 'local-child', items: [] }) } as unknown as WordPlanetApi
    const view = render(<ReviewCenter api={oldApi} onReview={vi.fn()} />)
    view.rerender(<ReviewCenter api={newApi} onReview={vi.fn()} />)
    await screen.findByText('现在没有需要复习的单词')
    await act(async () => finish({ profileId: 'local-child', items: [{ word: apple, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 300 }] }))
    expect(screen.queryByRole('heading', { name: 'apple' })).not.toBeInTheDocument()
    expect(screen.getByText('现在没有需要复习的单词')).toBeVisible()
  })
  it('starts a short group from the first five actual review items', async () => {
    const user = userEvent.setup()
    const items: ReviewItem[] = Array.from({ length: 7 }, (_, index) => ({ word: { ...apple, id: `word-${index}`, term: `word${index}` }, misses: 1, correct: 0, weakness: index < 4 ? 1 : 0, lastAttemptAt: 300 }))
    const onReview = vi.fn()
    const api = { getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items }) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onReview={onReview} />)

    expect(await screen.findByText('本次可练 7 个单词')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '练前 5 个' }))
    expect(onReview).toHaveBeenCalledWith(items.slice(0, 5))
    await user.click(screen.getByRole('button', { name: '复习 word6' }))
    expect(onReview).toHaveBeenLastCalledWith([items[6]])
  })

  it('keeps an original review item visible when its latest practice could not be saved', async () => {
    const item = { word: apple, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 300 }
    const api = { getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [] }) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onReview={vi.fn()} retainedItems={[item]} />)
    expect(await screen.findByRole('button', { name: '复习 apple' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('保存还没确认')
    expect(screen.queryByText('现在没有需要复习的单词')).not.toBeInTheDocument()
  })
  it('offers a direct route back to learning when there are no due words', async () => {
    const user = userEvent.setup()
    const openBooks = vi.fn()
    const api = { getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [] }) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onReview={vi.fn()} onOpenCurriculum={openBooks} />)
    await user.click(await screen.findByRole('button', { name: '去选单词' }))
    expect(openBooks).toHaveBeenCalledOnce()
  })
  it('shows only the real server review queue and opens the selected word', async () => {
    const user = userEvent.setup()
    const onReview = vi.fn()
    const api = {
      getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [{ word: apple, misses: 2, correct: 1, weakness: 1, lastAttemptAt: 300 }] }),
    } as unknown as WordPlanetApi

    render(<ReviewCenter api={api} onReview={onReview} />)

    expect(await screen.findByRole('heading', { name: '需要再练的单词' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'apple' })).toBeVisible()
    expect(screen.getByText(/错 2 次 · 对 1 次/)).toBeVisible()
    expect(screen.queryByText(/功能演示/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复习 apple' }))
    expect(onReview).toHaveBeenCalledWith([{ word: apple, misses: 2, correct: 1, weakness: 1, lastAttemptAt: 300 }])
  })

  it('never invents review data when the service is unavailable', async () => {
    const api = { getReview: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onReview={vi.fn()} />)
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
