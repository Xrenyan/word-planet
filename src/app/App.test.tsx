import { fireEvent, render, screen } from '@testing-library/react'
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
  it('retains the actual item when leaving a pending review through the main navigation', async () => {
    const user = userEvent.setup()
    const client = api()
    const word = { id: 'aunt', bookId: 'g4-upper', unit: 6, order: 1, term: 'aunt', meaningZh: '姑母', ipaUk: '/ɑːnt/', ipaUs: '/ænt/', image: { src: '/aunt.png', alt: '姑母', license: 'test' }, source: { title: 'Unit', url: 'https://example.com', page: 1 } }
    const item = { word, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 300 }
    client.getReview = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', items: [item] }).mockResolvedValue({ profileId: 'local-child', items: [] })
    window.history.replaceState(null, '', '#mistakes')
    render(<App apiClient={client} progressRecorder={{ record: () => new Promise<'saved'>(() => {}), flush: vi.fn().mockResolvedValue(0) }} />)

    await user.click(await screen.findByRole('button', { name: '复习 aunt' }))
    await user.type(await screen.findByLabelText('根据中文写英文'), 'aunt{enter}')
    await user.click(screen.getByRole('link', { name: '错词本' }))
    expect(await screen.findByRole('button', { name: '复习 aunt' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('保存还没确认')
    expect(client.getReview).toHaveBeenCalledTimes(2)
  })

  it('keeps an unconfirmed review item after reopening without an answer until a later save is confirmed', async () => {
    const user = userEvent.setup()
    const client = api()
    const word = { id: 'aunt', bookId: 'g4-upper', unit: 6, order: 1, term: 'aunt', meaningZh: '姑母', ipaUk: '/ɑːnt/', ipaUs: '/ænt/', image: { src: '/aunt.png', alt: '姑母', license: 'test' }, source: { title: 'Unit', url: 'https://example.com', page: 1 } }
    const item = { word, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 300 }
    const record = vi.fn().mockResolvedValueOnce('memory-only').mockResolvedValue('saved')
    client.getReview = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', items: [item] }).mockResolvedValue({ profileId: 'local-child', items: [] })
    window.history.replaceState(null, '', '#mistakes')
    render(<App apiClient={client} progressRecorder={{ record, flush: vi.fn().mockResolvedValue(0) }} />)

    await user.click(await screen.findByRole('button', { name: '复习 aunt' }))
    await user.type(await screen.findByLabelText('根据中文写英文'), 'aunt{enter}')
    await screen.findByRole('heading', { name: '这组复习完成啦！' })
    await user.click(screen.getByRole('button', { name: '返回错词本' }))
    await user.click(await screen.findByRole('button', { name: '复习 aunt' }))
    await user.click(await screen.findByRole('button', { name: '返回错词本' }))
    expect(await screen.findByRole('button', { name: '复习 aunt' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('保存还没确认')
    expect(record).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '复习 aunt' }))
    await user.type(await screen.findByLabelText('根据中文写英文'), 'aunt{enter}')
    await screen.findByRole('heading', { name: '这组复习完成啦！' })
    await user.click(screen.getByRole('button', { name: '返回错词本' }))
    expect(await screen.findByText('现在没有需要复习的单词')).toBeVisible()
    expect(screen.queryByText('保存还没确认，这些词先为你保留。')).not.toBeInTheDocument()
  })

  it.each(['saved', 'memory-only'] as const)('returns from a one-word review with %s writes and refreshes the real queue', async status => {
    const user = userEvent.setup()
    const client = api()
    const word = { id: 'aunt', bookId: 'g4-upper', unit: 6, order: 1, term: 'aunt', meaningZh: '姑母', ipaUk: '/ɑːnt/', ipaUs: '/ænt/', image: { src: '/aunt.png', alt: '姑母', license: 'test' }, source: { title: 'Unit', url: 'https://example.com', page: 1 } }
    const item = { word, misses: 1, correct: 0, weakness: 1, lastAttemptAt: 300 }
    client.getReview = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', items: [item] }).mockResolvedValue({ profileId: 'local-child', items: [] })
    client.getWords = vi.fn().mockResolvedValue({ bookId: word.bookId, words: [word, { ...word, id: 'unrelated', term: 'uncle' }] })
    window.history.replaceState(null, '', '#mistakes')
    render(<App apiClient={client} progressRecorder={{ record: vi.fn().mockResolvedValue(status), flush: vi.fn().mockResolvedValue(0) }} />)

    await user.click(await screen.findByRole('button', { name: '复习 aunt' }))
    expect(await screen.findByText('第 1 / 1 词')).toBeVisible()
    await user.type(screen.getByLabelText('根据中文写英文'), 'aunt{enter}')
    await screen.findByRole('heading', { name: '这组复习完成啦！' })
    await user.click(screen.getByRole('button', { name: '返回错词本' }))
    expect(await screen.findByRole('heading', { name: '需要再练的单词' })).toBeVisible()
    expect(window.location.hash).toBe('#mistakes')
    expect(client.getReview).toHaveBeenCalledTimes(2)
    if (status === 'saved') expect(await screen.findByText('现在没有需要复习的单词')).toBeVisible()
    else {
      expect(await screen.findByRole('button', { name: '复习 aunt' })).toBeVisible()
      expect(screen.getByRole('alert')).toHaveTextContent('保存还没确认')
    }
    expect(client.getWords).not.toHaveBeenCalled()
  })

  it('refreshes backup records after a round trip through practice', async () => {
    const client = api()
    const word = { id: 'aunt', bookId: 'g3-upper', unit: 2, order: 1, term: 'aunt', meaningZh: '姑母', ipaUk: '/ɑːnt/', ipaUs: '/ænt/', image: { src: '/aunt.png', alt: '姑母', license: 'test' }, source: { title: 'Unit', url: 'https://example.com', page: 1 } }
    client.getBooks = vi.fn().mockResolvedValue({ books: [{ id: word.bookId, label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 1 }] })
    client.getWords = vi.fn().mockResolvedValue({ bookId: word.bookId, words: [word] })
    const events: Parameters<typeof recorder.record>[0][] = []
    client.getProgress = vi.fn(async () => ({ profileId: 'local-child', totalEvents: events.length, priorityWordIds: [], events: [...events] }))
    const record = vi.fn(async event => { events.push(event); return 'saved' as const })
    render(<App apiClient={client} progressRecorder={{ record, flush: vi.fn().mockResolvedValue(0) }} />)
    await userEvent.click(screen.getByRole('link', { name: '工具箱' }))
    await userEvent.click(await screen.findByText('家长工具', { selector: 'summary' }))
    expect(await screen.findByText('当前有 0 条可备份的学习记录')).toBeVisible()
    await userEvent.click(screen.getByRole('link', { name: '练习' }))
    await screen.findByText('第 1 / 1 词')
    await userEvent.click(screen.getByRole('button', { name: '看义拼写' }))
    await userEvent.type(screen.getByLabelText('根据中文写英文'), 'aunt{enter}')
    await userEvent.click(screen.getByRole('link', { name: '工具箱' }))
    expect(await screen.findByText('当前有 1 条可备份的学习记录')).toBeVisible()
  })
  it('returns from practice to the same book and bookmarked word', async () => {
    const client = api()
    const word = { id: 'aunt', bookId: 'g3-upper', unit: 2, order: 1, term: 'aunt', meaningZh: '姑母', ipaUk: '/ɑːnt/', ipaUs: '/ænt/', image: { src: '/aunt.png', alt: '姑母', license: 'test' }, source: { title: 'Unit', url: 'https://example.com', page: 1 } }
    client.getWords = vi.fn().mockResolvedValue({ bookId: word.bookId, words: [word] })
    window.history.replaceState(null, '', '#textbook/g3-upper')
    render(<App apiClient={client} progressRecorder={recorder} />)
    await userEvent.click(await screen.findByRole('button', { name: '学习 aunt' }))
    await screen.findByText('第 1 / 1 词')
    await userEvent.click(screen.getByRole('button', { name: '返回词表' }))
    expect(await screen.findByRole('region', { name: '当前单词 aunt' })).toBeVisible()
    expect(window.location.hash).toBe('#textbook/g3-upper')
  })
  it('keeps private pairing recovery material in memory when navigating away from the toolbox', async () => {
    const user = userEvent.setup()
    render(<App apiClient={api()} progressRecorder={recorder} />)
    await user.click(screen.getByRole('link', { name: '工具箱' }))
    const parentTools = await screen.findByText('家长工具', { selector: 'summary' })
    expect(screen.queryByRole('textbox', { name: '配对码' })).not.toBeInTheDocument()
    await user.click(parentTools)
    const code = await screen.findByLabelText('配对码', { selector:'input' })
    await user.type(code,'pending-private-recovery-material')
    await user.click(screen.getByRole('link', { name: '教材' }))
    expect(await screen.findByRole('heading',{name:'教材'})).toBeVisible()
    expect(screen.queryByRole('textbox',{name:'配对码'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name:'工具箱' }))
    expect(await screen.findByLabelText('配对码', { selector:'input' })).toHaveValue('pending-private-recovery-material')
  })
  it('opens a direct route and follows browser history changes', async () => {
    window.history.replaceState(null, '', '#mistakes')
    render(<App apiClient={api()} progressRecorder={recorder} />)
    expect(await screen.findByRole('heading', { name: '需要再练的单词' })).toBeVisible()
    window.history.replaceState(null, '', '#textbook')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(await screen.findByRole('heading', { name: '教材' })).toBeVisible()
  })
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
