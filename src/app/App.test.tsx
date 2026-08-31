import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from './api/client'
import { App } from './App'

function api(): WordPlanetApi {
  return {
    getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 0 }] }),
    getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [] }),
    getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 0, priorityWordIds: [], events: [] }),
    getReview: vi.fn().mockResolvedValue({ profileId: 'local-child', items: [] }),
    clearProgress: vi.fn().mockResolvedValue({ status: 'cleared', deletedEvents: 0 }),
  }
}

const recorder = { record: vi.fn().mockResolvedValue('synced' as const), flush: vi.fn().mockResolvedValue(0) }

describe('App enterprise data paths', () => {
  it('contains no old demo learning or duplicate worksheet entry', async () => {
    const user = userEvent.setup()
    render(<App apiClient={api()} progressRecorder={recorder} />)

    await user.click(screen.getByRole('link', { name: '教材' }))
    expect(await screen.findByRole('heading', { name: '教材' })).toBeVisible()
    expect(screen.queryByText(/功能演示|体验功能演示/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '工具箱' }))
    expect(await screen.findByRole('heading', { name: '单元默写纸' })).toBeVisible()
    expect(screen.getAllByRole('heading', { name: '单元默写纸' })).toHaveLength(1)
    expect(screen.queryByText('默写纸工坊')).not.toBeInTheDocument()
  })

  it('uses the server review center instead of a local demo review book', async () => {
    const user = userEvent.setup()
    const serverApi = api()
    render(<App apiClient={serverApi} progressRecorder={recorder} />)
    await user.click(screen.getByRole('link', { name: '错词本' }))
    expect(await screen.findByRole('heading', { name: '需要再练的单词' })).toBeVisible()
    expect(serverApi.getReview).toHaveBeenCalledWith('local-child', expect.any(AbortSignal))
    expect(screen.queryByText(/仅保存在此设备|功能演示/)).not.toBeInTheDocument()
  })
})
