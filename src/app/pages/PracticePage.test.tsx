import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PracticePage } from './PracticePage'

const word = {
  id: 'verified-apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果',
  ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/', image: { src: '/apple.webp', alt: '一个苹果', license: 'reviewed' },
  source: { title: 'owned', url: 'test:1', page: 1 },
}

const nextWord = {
  ...word,
  id: 'verified-cat',
  order: 2,
  term: 'cat',
  meaningZh: '猫',
  image: { ...word.image, alt: '一只猫' },
}

describe('PracticePage verified session', () => {
  it('starts with the actual word visible and keeps every practice mode reachable', async () => {
    const user = userEvent.setup()
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }) }
    const record = vi.fn().mockResolvedValue('synced')
    render(<PracticePage word={word} api={api} progressRecorder={{ record }} />)
    await screen.findByText('第 1 / 2 词')

    expect(screen.getByRole('button', { name: '认识单词' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('apple')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '看义拼写' }))
    expect(screen.getByRole('button', { name: '看义拼写' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '听音选词' }))
    expect(screen.getByText('听发音，选择正确的中文意思')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '选择中文：猫' }))
    expect(screen.getByRole('heading', { name: '练习 · 苹果' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '选择中文：苹果' }))
    expect(await screen.findByRole('heading', { name: '练习 · 猫' }, { timeout: 1500 })).toBeVisible()
    expect(record.mock.calls.map(([event]) => ({ outcome: event.outcome, source: event.source }))).toEqual([
      { outcome: 'missed', source: 'recognition' },
      { outcome: 'correct', source: 'recognition' },
    ])
  })

  it('offers an honest self-paced follow-reading mode without inventing a score', async () => {
    const user = userEvent.setup()
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }) }
    const record = vi.fn().mockResolvedValue('synced')
    render(<PracticePage word={word} api={api} progressRecorder={{ record }} />)
    await screen.findByText('第 1 / 2 词')

    await user.click(screen.getByRole('button', { name: '跟读练习' }))
    expect(screen.getByText('完成跟读后继续；没有真实评测时不会生成分数。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '跟读完成，下一词' }))
    expect(screen.getByRole('heading', { name: '练习 · 猫' })).toBeVisible()
    expect(record).not.toHaveBeenCalled()
  })

  it('provides continuous previous, next, progress and back controls for the loaded book', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const api = {
      getBooks: vi.fn(),
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }),
    }
    render(<PracticePage word={word} api={api} onBack={onBack} />)

    expect(await screen.findByText('第 1 / 2 词')).toBeVisible()
    expect(screen.getByRole('button', { name: '上一个单词' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '下一个单词' }))
    expect(screen.getByRole('heading', { name: '学习 · 猫' })).toBeVisible()
    expect(screen.getByText('第 2 / 2 词')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '上一个单词' }))
    expect(screen.getByRole('heading', { name: '学习 · 苹果' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '返回今天' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('automatically advances after a correct answer while keeping wrong answers on the current word', async () => {
    const user = userEvent.setup()
    const api = {
      getBooks: vi.fn(),
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }),
    }
    const record = vi.fn().mockResolvedValue('synced')
    render(<PracticePage word={word} api={api} progressRecorder={{ record }} />)
    await screen.findByText('第 1 / 2 词')
    await user.click(screen.getByRole('button', { name: '看义拼写' }))

    await user.type(screen.getByLabelText('根据中文写英文'), 'pear{enter}')
    expect(screen.getByRole('heading', { name: '练习 · 苹果' })).toBeVisible()
    await user.clear(screen.getByLabelText('根据中文写英文'))
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')

    expect(await screen.findByRole('heading', { name: '练习 · 猫' }, { timeout: 1500 })).toBeVisible()
    expect(screen.getByLabelText('根据中文写英文')).toHaveValue('')
  })

  it('does not leak a slow save message onto the next word', async () => {
    const user = userEvent.setup()
    let finishSave!: (status: 'synced') => void
    const record = vi.fn(() => new Promise<'synced'>((resolve) => { finishSave = resolve }))
    const api = {
      getBooks: vi.fn(),
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }),
    }
    render(<PracticePage word={word} api={api} progressRecorder={{ record }} />)
    await screen.findByText('第 1 / 2 词')
    await user.click(screen.getByRole('button', { name: '看义拼写' }))

    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    expect(await screen.findByRole('heading', { name: '练习 · 猫' }, { timeout: 1500 })).toBeVisible()
    await act(async () => finishSave('synced'))

    expect(screen.queryByText(/记录已同步/)).not.toBeInTheDocument()
  })

  it('loads a real sourced word when the practice route is opened directly', async () => {
    const api = {
      getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'source-matched', verifiedWordCount: 0, availableWordCount: 1 }] }),
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [{ ...word, sourceConfidence: 'public-secondary' }] }),
    }
    render(<PracticePage api={api} />)

    expect(screen.getByText('正在准备第一组练习题……')).toBeVisible()
    expect(await screen.findByRole('heading', { name: '学习 · 苹果' })).toBeVisible()
    expect(screen.getByText('apple')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '看义拼写' }))
    expect(screen.getByLabelText('根据中文写英文')).toBeEnabled()
    expect(api.getWords).toHaveBeenCalledWith('g3-upper', undefined, expect.any(AbortSignal))
  })

  it('records wrong and correct spelling outcomes against the same verified word id', async () => {
    const user = userEvent.setup()
    const record = vi.fn().mockResolvedValueOnce('queued').mockResolvedValueOnce('synced')
    render(<PracticePage word={word} progressRecorder={{ record }} />)
    await user.click(screen.getByRole('button', { name: '看义拼写' }))

    await user.type(screen.getByLabelText('根据中文写英文'), 'pear{enter}')
    expect(await screen.findByText('再练一次，错词已保存在此设备')).toBeVisible()
    await user.clear(screen.getByLabelText('根据中文写英文'))
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    expect(await screen.findByText(/答对了，已保存在此设备/)).toBeVisible()

    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls.map(([event]) => ({ wordId: event.wordId, outcome: event.outcome, source: event.source }))).toEqual([
      { wordId: 'verified-apple', outcome: 'missed', source: 'spelling' },
      { wordId: 'verified-apple', outcome: 'correct', source: 'spelling' },
    ])
    expect(record.mock.calls[0][0].id).not.toBe(record.mock.calls[1][0].id)
  })
})
