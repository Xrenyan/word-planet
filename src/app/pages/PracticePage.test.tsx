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
  it('practices exactly the supplied review queue across books without extending it', async () => {
    const user = userEvent.setup()
    const lastReviewWord = { ...nextWord, bookId: 'g4-upper', unit: 6 }
    const extra = { ...word, id: 'unrelated', term: 'pear', meaningZh: '梨' }
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: word.bookId, words: [word, extra, nextWord] }) }
    const onBack = vi.fn()
    render(<PracticePage word={word} reviewWords={[word, lastReviewWord]} api={api} onBack={onBack} />)

    expect(await screen.findByText('第 1 / 2 词')).toBeVisible()
    expect(screen.getByRole('button', { name: '看义拼写' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    await screen.findByText('第 2 / 2 词')
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('猫')
    await user.type(screen.getByLabelText('根据中文写英文'), 'cat{enter}')
    expect(await screen.findByRole('heading', { name: '这组复习完成啦！' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '继续下一组' })).not.toBeInTheDocument()
    expect(screen.queryByText('pear')).not.toBeInTheDocument()
    expect(api.getWords).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '返回错词本' }))
    expect(onBack).toHaveBeenCalledWith({ unconfirmedWordIds: [], confirmedWordIds: [] })
  })

  it('keeps a word in the short retry group when it is missed again', async () => {
    const user = userEvent.setup()
    render(<PracticePage reviewWords={[word]} />)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.type(screen.getByLabelText('根据中文写英文'), 'pear{enter}')
      await user.clear(screen.getByLabelText('根据中文写英文'))
      await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
      await screen.findByRole('heading', { name: '这组复习完成啦！' })
      expect(screen.getByText('首次答对 0 / 1')).toBeVisible()
      expect(screen.getByText('再巩固')).toBeVisible()
      await user.click(screen.getByRole('button', { name: '再练错词（1）' }))
    }
    expect(screen.getByText('第 1 / 1 词')).toBeVisible()
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('苹果')
  })

  it('returns immediately while a review save is pending and identifies the unconfirmed word', async () => {
    const user = userEvent.setup()
    let finishSave!: (status: 'memory-only') => void
    const onBack = vi.fn()
    render(<PracticePage reviewWords={[word]} onBack={onBack} progressRecorder={{ record: () => new Promise(resolve => { finishSave = resolve }) }} />)
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    await user.click(screen.getByRole('button', { name: '返回错词本' }))
    expect(onBack).toHaveBeenCalledWith({ unconfirmedWordIds: [word.id], confirmedWordIds: [] })
    await act(async () => finishSave('memory-only'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('deduplicates matching artwork sources for the next two words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sharedSource = 'https://images.example.test/shared-upcoming-art.jpg'
    const words = [word, { ...nextWord, image: { ...nextWord.image, src: sharedSource } }, { ...nextWord, id: 'third-word', image: { ...nextWord.image, src: sharedSource } }]
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: word.bookId, words }) }
    render(<PracticePage word={word} api={api} />)
    await screen.findByText('第 1 / 3 词')
    expect(document.querySelectorAll(`link[rel="preload"][href="${sharedSource}"]`)).toHaveLength(1)
    expect(error.mock.calls.flat().join(' ')).not.toContain('same key')
    error.mockRestore()
  })

  it('prioritizes the visible artwork and warms only the next two images', async () => {
    const words = Array.from({ length: 5 }, (_, i) => ({ ...word, id: `image-word-${i}`, image: { ...word.image, src: `https://images.example.test/word-${i}.jpg`, alt: `配图${i}` } }))
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: word.bookId, words }) }
    render(<PracticePage word={words[0]} api={api} />)
    await screen.findByText('第 1 / 5 词')
    expect(screen.getByAltText('配图0')).toHaveAttribute('loading', 'eager')
    const sources = [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].map(link => link.href)
    expect(sources).toContain('https://images.example.test/word-1.jpg')
    expect(sources).toContain('https://images.example.test/word-2.jpg')
    expect(sources).not.toContain('https://images.example.test/word-4.jpg')
  })
  it('keeps a failed-save warning visible after automatically advancing', async () => {
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }) }
    render(<PracticePage word={word} api={api} progressRecorder={{ record: vi.fn().mockResolvedValue('memory-only') }} />)
    await screen.findByText('第 1 / 2 词')
    await userEvent.click(screen.getByRole('button', { name: '看义拼写' }))
    await userEvent.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    await screen.findByText('第 2 / 2 词')
    expect(screen.getByRole('alert')).toHaveTextContent('这次练习没能保存')
  })

  it('retries a direct practice request after the network recovers', async () => {
    const api = { getBooks: vi.fn().mockResolvedValue({ books: [{ id: word.bookId, availableWordCount: 2 }] }), getWords: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ bookId: word.bookId, words: [word, nextWord] }) }
    render(<PracticePage api={api} />)
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: '再试一次' }))
    expect(await screen.findByText('第 1 / 2 词')).toBeVisible()
  })
  it('finishes a short group and retests only the words missed in that group', async () => {
    const user = userEvent.setup()
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [word, nextWord] }) }
    render(<PracticePage word={word} api={api} />)
    await screen.findByText('第 1 / 2 词')
    await user.click(screen.getByRole('button', { name: '看义拼写' }))
    await user.type(screen.getByLabelText('根据中文写英文'), 'pear{enter}')
    await user.clear(screen.getByLabelText('根据中文写英文'))
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    await screen.findByText('第 2 / 2 词')
    await user.type(screen.getByLabelText('根据中文写英文'), 'cat{enter}')
    expect(await screen.findByRole('heading', { name: '这一组完成啦！' })).toBeVisible()
    expect(screen.getByText('首次答对 1 / 2')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '再练错词（1）' }))
    expect(screen.getByText('第 1 / 1 词')).toBeVisible()
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('苹果')
  })

  it('starts the next group without repeating the first eight words', async () => {
    const user = userEvent.setup()
    const words = Array.from({length: 10}, (_, i) => ({...word, id: `word-${i}`, term: `word${i}`, meaningZh: `词${i}`}))
    const api = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words }) }
    render(<PracticePage word={words[0]} api={api} />)
    await screen.findByText('第 1 / 8 词')
    for (let i = 0; i < 7; i++) await user.click(screen.getByRole('button', { name: '下一个单词' }))
    await user.click(screen.getByRole('button', { name: '完成这一组' }))
    await user.click(screen.getByRole('button', { name: '继续下一组' }))
    expect(screen.getByRole('region', { name: '正在学习单词 word8' })).toBeVisible()
    expect(screen.getByText('第 1 / 2 词')).toBeVisible()
  })

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
    expect(screen.getByRole('heading', { name: '听音挑战' })).toBeVisible()
    expect(screen.queryByText(word.ipaUk)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选择中文：苹果' }))
    expect(await screen.findByText('第 2 / 2 词', {}, { timeout: 1500 })).toBeVisible()
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
    expect(screen.getByText('apple')).toBeVisible()
    expect(screen.getByRole('button', { name: '开始跟读' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '跟读完成，下一词' }))
    expect(screen.getByRole('region', { name: '正在学习单词 cat' })).toBeVisible()
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
    expect(screen.getByRole('region', { name: '正在学习单词 cat' })).toBeVisible()
    expect(screen.getByText('第 2 / 2 词')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '上一个单词' }))
    expect(screen.getByRole('region', { name: '正在学习单词 apple' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '返回词表' }))
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
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('苹果')
    await user.clear(screen.getByLabelText('根据中文写英文'))
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')

    await screen.findByText('第 2 / 2 词', {}, { timeout: 1500 })
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('猫')
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
    await screen.findByText('第 2 / 2 词', {}, { timeout: 1500 })
    expect(screen.getByRole('region', { name: '中文提示' })).toHaveTextContent('猫')
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
    expect(await screen.findByRole('region', { name: '正在学习单词 apple' })).toBeVisible()
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
    expect(screen.getByText('再听一遍试试，答案会保留在当前单词')).toBeVisible()
    await user.clear(screen.getByLabelText('根据中文写英文'))
    await user.type(screen.getByLabelText('根据中文写英文'), 'apple{enter}')
    expect(screen.getByText('答对了，本组练习完成')).toBeVisible()

    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls.map(([event]) => ({ wordId: event.wordId, outcome: event.outcome, source: event.source }))).toEqual([
      { wordId: 'verified-apple', outcome: 'missed', source: 'spelling' },
      { wordId: 'verified-apple', outcome: 'correct', source: 'spelling' },
    ])
    expect(record.mock.calls[0][0].id).not.toBe(record.mock.calls[1][0].id)
  })
})
