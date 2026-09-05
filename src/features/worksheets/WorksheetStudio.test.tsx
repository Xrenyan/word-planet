import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { WorksheetStudio } from './WorksheetStudio'

describe('WorksheetStudio', () => {
  it('generates printable question and answer pages from a verified book selection', async () => {
    const user = userEvent.setup()
    const api = { getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 10 }] }), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [{ id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果', ipaUk: '/æpl/', ipaUs: '/æpl/', image: { src: '/apple.webp', alt: '苹果', license: 'original-generated-reviewed' }, source: { title: '教材', url: 'https://example.com', page: 1 } }] }) } as WordPlanetApi
    const fetchWorksheet = vi.fn().mockResolvedValue({
      id: 'sheet-1', title: 'Unit 1 默写练习', source: { bookId: 'g3-upper', unit: 1, contentStatus: 'verified' },
      questions: [{ number: 1, wordId: 'apple', prompt: '苹果', blank: '________', image: { src: '/apple.webp', alt: '苹果', license: 'original-generated-reviewed' } }],
      answers: [{ number: 1, wordId: 'apple', answer: 'apple' }],
    })
    render(<WorksheetStudio api={api} fetchWorksheet={fetchWorksheet} />)

    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))

    expect(screen.getByRole('heading', { name: 'Unit 1 默写练习' })).toBeVisible()
    expect(screen.getByText('1. 苹果')).toBeVisible()
    expect(screen.getByText('apple')).toBeVisible()
    expect(screen.getByText('题目保留内容状态；公开匹配词不会冒充出版社核验词')).toBeVisible()
    expect(fetchWorksheet).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'g3-upper', unit: 1 }))
    expect(screen.getByRole('button', { name: '仅打印题目' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '打印题目与答案' })).toBeEnabled()
    expect(screen.getByText('班级：')).toBeVisible()
    expect(screen.getByText('姓名：')).toBeVisible()
    expect(screen.getByText('日期：')).toBeVisible()
  })

  it('prints either the question sheet alone or questions with a separate answer page', async () => {
    const user = userEvent.setup()
    const printModes: string[] = []
    vi.spyOn(window, 'print').mockImplementation(() => printModes.push(document.body.dataset.worksheetPrintMode ?? 'missing'))
    const api = { getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 1 }] }), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [{ id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果', ipaUk: '/æpl/', ipaUs: '/æpl/', image: { src: '/apple.webp', alt: '苹果', license: 'reviewed' }, source: { title: '教材', url: 'https://example.com', page: 1 } }] }) } as WordPlanetApi
    const fetchWorksheet = vi.fn().mockResolvedValue({
      id: 'sheet-1', title: 'Unit 1 默写练习', source: { bookId: 'g3-upper', unit: 1, contentStatus: 'verified' },
      questions: [{ number: 1, wordId: 'apple', prompt: '苹果', blank: '________', image: { src: '/apple.webp', alt: '苹果', license: 'reviewed' } }],
      answers: [{ number: 1, wordId: 'apple', answer: 'apple' }],
    })
    render(<WorksheetStudio api={api} fetchWorksheet={fetchWorksheet} />)
    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))

    await user.click(screen.getByRole('button', { name: '仅打印题目' }))
    await user.click(screen.getByRole('button', { name: '打印题目与答案' }))

    expect(printModes).toEqual(['questions', 'all'])
  })

  it('paginates larger worksheets into fixed A4-sized question pages', async () => {
    const user = userEvent.setup()
    const api = { getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 13 }] }), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: Array.from({ length: 13 }, (_, index) => ({ id: `word-${index + 1}`, bookId: 'g3-upper', unit: 1, order: index + 1, term: `word${index + 1}`, meaningZh: `词${index + 1}`, ipaUk: '/w/', ipaUs: '/w/', image: { src: `/word-${index + 1}.webp`, alt: `词${index + 1}`, license: 'original-generated-reviewed' }, source: { title: '教材', url: 'https://example.com', page: 1 } })) }) } as WordPlanetApi
    const questions = Array.from({ length: 13 }, (_, index) => ({ number: index + 1, wordId: `word-${index + 1}`, prompt: `词${index + 1}`, blank: '________', image: { src: `/word-${index + 1}.webp`, alt: `词${index + 1}`, license: 'original-generated-reviewed' } }))
    const answers = questions.map((question) => ({ number: question.number, wordId: question.wordId, answer: `word${question.number}` }))
    render(<WorksheetStudio api={api} fetchWorksheet={vi.fn().mockResolvedValue({ id: 'sheet-13', title: 'Unit 1 默写练习', source: { bookId: 'g3-upper', unit: 1, contentStatus: 'verified' }, questions, answers })} />)

    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))

    expect(screen.getByLabelText('默写题目页 1/2')).toBeVisible()
    expect(screen.getByLabelText('默写题目页 2/2')).toBeVisible()
    expect(screen.getByLabelText('默写答案页 1/1')).toBeVisible()
  })
})
