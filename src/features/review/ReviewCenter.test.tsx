import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VocabularyWordContract } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { ReviewCenter } from './ReviewCenter'

const apple: VocabularyWordContract = {
  id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果',
  ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/',
  image: { src: '/apple.webp', alt: '一个红苹果', license: 'reviewed' },
  source: { title: 'source', url: 'https://example.test', page: 1 },
}

describe('ReviewCenter', () => {
  it('offers a direct route back to learning when there are no due words', async () => {
    const user = userEvent.setup()
    const openBooks = vi.fn()
    const api = { getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [] }) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onStudy={vi.fn()} onOpenCurriculum={openBooks} />)
    await user.click(await screen.findByRole('button', { name: '去选单词' }))
    expect(openBooks).toHaveBeenCalledOnce()
  })
  it('shows only the real server review queue and opens the selected word', async () => {
    const user = userEvent.setup()
    const onStudy = vi.fn()
    const api = {
      getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [{ word: apple, misses: 2, correct: 1, weakness: 1, lastAttemptAt: 300 }] }),
    } as unknown as WordPlanetApi

    render(<ReviewCenter api={api} onStudy={onStudy} />)

    expect(await screen.findByRole('heading', { name: '需要再练的单词' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'apple' })).toBeVisible()
    expect(screen.getByText(/错 2 次 · 对 1 次/)).toBeVisible()
    expect(screen.queryByText(/功能演示/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复习 apple' }))
    expect(onStudy).toHaveBeenCalledWith(apple)
  })

  it('never invents review data when the service is unavailable', async () => {
    const api = { getReview: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as WordPlanetApi
    render(<ReviewCenter api={api} onStudy={vi.fn()} />)
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
