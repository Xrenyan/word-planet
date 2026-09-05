import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { TodayDashboard } from './TodayDashboard'

const verifiedWord = {
  id: 'apple',
  bookId: 'g3-upper',
  unit: 1,
  order: 1,
  term: 'apple',
  meaningZh: '苹果',
  ipaUk: '/ˈæp.əl/',
  ipaUs: '/ˈæp.əl/',
  image: { src: '/demo/word-art/planet.png', alt: '苹果记忆图', license: 'original-generated-reviewed' },
  source: { title: 'verified source', url: 'test-only:page-1', page: 1 },
}

function api(overrides: Partial<WordPlanetApi> = {}): WordPlanetApi {
  return {
    getBooks: vi.fn().mockResolvedValue({
      books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 1 }],
    }),
    getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [verifiedWord] }),
    ...overrides,
  }
}

describe('TodayDashboard', () => {
  it('renders the first verified word from the real curriculum api', async () => {
    render(<TodayDashboard api={api()} />)

    expect(screen.getByRole('heading', { name: '今天的学习' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'apple' })).toBeVisible()
    expect(screen.getByText('/ˈæp.əl/', { selector: '.today-dashboard__ipa--uk' })).toBeVisible()
    expect(screen.getByText('苹果', { selector: '.today-dashboard__meaning' })).toBeVisible()
    expect(screen.getByRole('button', { name: '开始学习' })).toBeEnabled()
  })

  it('shows an immediate loading state while the api is still pending', () => {
    const pending = new Promise<never>(() => undefined)
    render(<TodayDashboard api={api({ getBooks: () => pending })} />)

    expect(screen.getByRole('status')).toHaveTextContent('正在读取教材')
  })

  it('offers a working retry when the curriculum api fails', async () => {
    const getBooks = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ books: [] })
    render(<TodayDashboard api={api({ getBooks })} />)

    const retry = await screen.findByRole('button', { name: '重新读取' })
    retry.click()

    await waitFor(() => expect(getBooks).toHaveBeenCalledTimes(2))
  })

  it('selects the server-prioritized missed word for the next verified session', async () => {
    const pear = { ...verifiedWord, id: 'pear', term: 'pear', meaningZh: '梨' }
    render(<TodayDashboard api={api({
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [pear, verifiedWord] }),
      getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 2, priorityWordIds: ['apple'], events: [] }),
    })} />)

    expect(await screen.findByRole('heading', { name: 'apple' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'pear' })).not.toBeInTheDocument()
  })

  it('shows today completed words from real progress events instead of a hard-coded zero', async () => {
    const pear = { ...verifiedWord, id: 'pear', term: 'pear', meaningZh: '梨' }
    render(<TodayDashboard api={api({
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [verifiedWord, pear] }),
      getProgress: vi.fn().mockResolvedValue({
        profileId: 'local-child', totalEvents: 1, priorityWordIds: [],
        events: [{ id: 'today-apple', profileId: 'local-child', wordId: 'apple', outcome: 'correct', source: 'spelling', occurredAt: Date.now() }],
      }),
    })} />)

    expect(await screen.findByText('今日已完成 1 / 2')).toBeVisible()
  })
})
