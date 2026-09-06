import { render, screen } from '@testing-library/react'
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
