import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import type { VocabularyWordContract, Worksheet } from '../../../shared/contracts'
import { WorksheetStudio } from './WorksheetStudio'
import { saveBookmark } from '../../learning/bookmark'

const apple = {
  id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果',
  ipaUk: '/æpl/', ipaUs: '/æpl/',
  image: { src: '/apple.webp', alt: '苹果', license: 'reviewed' },
  source: { title: '教材', url: 'https://example.com', page: 1 },
}
const books = [
  { id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 1 },
  { id: 'g4-lower', label: '四年级下册', grade: 4, semester: 'lower', status: 'verified', verifiedWordCount: 3 },
]
const laterBookWords = [
  { ...apple, id: 'pear', bookId: 'g4-lower', term: 'pear', meaningZh: '梨' },
  { ...apple, id: 'orange', bookId: 'g4-lower', unit: 3, term: 'orange', meaningZh: '橙子' },
  { ...apple, id: 'banana', bookId: 'g4-lower', unit: 3, order: 2, term: 'banana', meaningZh: '香蕉' },
]

function worksheetApi(words: readonly VocabularyWordContract[]): WordPlanetApi {
  return {
    getBooks: async () => ({ books: [{ ...books[0], availableWordCount: words.length }] }),
    getWords: async (_bookId, unit) => ({ bookId: 'g3-upper', words: unit ? words.filter(word => word.unit === unit) : words }),
  } as WordPlanetApi
}

function numberedWords(count: number): VocabularyWordContract[] {
  return Array.from({ length: count }, (_, index) => ({ ...apple, id: `word-${index + 1}`, order: index + 1, term: `word${index + 1}`, meaningZh: `词${index + 1}` }))
}

afterEach(() => vi.restoreAllMocks())

describe('WorksheetStudio', () => {
  it('generates a full standard page with one click from the default settings', async () => {
    const user = userEvent.setup()
    render(<WorksheetStudio api={worksheetApi(numberedWords(13))} />)
    await screen.findByRole('option', { name: 'Unit 1 · 13 词' })
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    const page = await screen.findByLabelText('默写题目页 1/1')
    expect(within(page).getAllByRole('listitem')).toHaveLength(12)
  })

  it('starts from the saved learning book and unit with a question count that fits that unit', async () => {
    saveBookmark({ bookId: 'g4-lower', wordId: 'orange' })
    const api = {
      getBooks: vi.fn().mockResolvedValue({ books }),
      getWords: vi.fn(async (bookId: string, unit?: number) => {
        const words = bookId === 'g4-lower' ? laterBookWords : [apple]
        return { bookId, words: unit ? words.filter(word => word.unit === unit) : words }
      }),
    } as WordPlanetApi
    const user = userEvent.setup()
    render(<WorksheetStudio api={api} />)

    await screen.findByRole('option', { name: 'Unit 3 · 2 词' })
    expect(screen.getByRole('combobox', { name: '教材' })).toHaveValue('g4-lower')
    expect(screen.getByRole('combobox', { name: '单元' })).toHaveValue('3')
    expect(screen.getByRole('spinbutton', { name: '题数' })).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    expect(await screen.findByRole('heading', { name: 'Unit 3 单词默写' })).toBeVisible()
    expect(screen.getByLabelText('默写题目页 1/1').querySelectorAll('li')).toHaveLength(2)

    await user.selectOptions(screen.getByRole('combobox', { name: '单元' }), '1')
    expect(screen.getByRole('spinbutton', { name: '题数' })).toHaveValue(1)
    expect(screen.queryByLabelText('默写题目页 1/1')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '教材' }), 'g3-upper')
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    expect(await screen.findByText('1. 苹果')).toBeVisible()
  })

  it('can retry loading the book list after a temporary failure', async () => {
    const user = userEvent.setup()
    const api = {
      getBooks: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ books: [books[0]] }),
      getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [apple] }),
    } as WordPlanetApi
    render(<WorksheetStudio api={api} />)

    await user.click(await screen.findByRole('button', { name: '重新加载教材' }))
    expect(await screen.findByRole('button', { name: '生成单元默写纸' })).toBeEnabled()
  })

  it('can retry loading the selected book without changing books', async () => {
    const user = userEvent.setup()
    const api = {
      getBooks: vi.fn().mockResolvedValue({ books: [books[0]] }),
      getWords: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ bookId: 'g3-upper', words: [apple] }),
    } as WordPlanetApi
    render(<WorksheetStudio api={api} />)

    await user.click(await screen.findByRole('button', { name: '重新加载单元' }))
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    expect(await screen.findByText('1. 苹果')).toBeVisible()
  })

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
    expect(screen.getByText('apple')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: '显示答案' }))
    expect(screen.getByText('apple')).toBeVisible()
    expect(fetchWorksheet).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'g3-upper', unit: 1 }))
    expect(screen.getByRole('button', { name: '仅打印题目' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '打印题目与答案' })).toBeEnabled()
    expect(screen.getByText('班级：')).toBeVisible()
    expect(screen.getByText('姓名：')).toBeVisible()
    expect(screen.getByText('日期：')).toBeVisible()
  })

  it.each([
    { direction: 'zh-en', prompt: '1. 苹果', answer: 'apple' },
    { direction: 'en-zh', prompt: '1. apple', answer: '苹果' },
  ])('prints $direction questions alone or with a separate answer page', async ({ direction, prompt, answer }) => {
    const user = userEvent.setup()
    const printModes: string[] = []
    vi.spyOn(window, 'print').mockImplementation(() => printModes.push(document.body.dataset.worksheetPrintMode ?? 'missing'))
    const api = { getBooks: vi.fn().mockResolvedValue({ books: [{ id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 1 }] }), getWords: vi.fn().mockResolvedValue({ bookId: 'g3-upper', words: [{ id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果', ipaUk: '/æpl/', ipaUs: '/æpl/', image: { src: '/apple.webp', alt: '苹果', license: 'reviewed' }, source: { title: '教材', url: 'https://example.com', page: 1 } }] }) } as WordPlanetApi
    render(<WorksheetStudio api={api} />)
    await user.selectOptions(await screen.findByRole('combobox', { name: '题型' }), direction)
    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))

    expect(within(await screen.findByLabelText('默写题目页 1/1')).getByText(prompt)).toBeVisible()
    expect(within(screen.getByLabelText('默写题目页 1/1')).queryByText(answer, { exact: true })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('默写答案页 1/1')).getByText(answer)).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: '仅打印题目' }))
    await user.click(screen.getByRole('button', { name: '打印题目与答案' }))

    expect(printModes).toEqual(['questions', 'all'])
    expect(within(screen.getByLabelText('默写答案页 1/1')).getByText(answer)).not.toBeVisible()
    window.dispatchEvent(new Event('afterprint'))
    expect(document.body.dataset.worksheetPrintMode).toBeUndefined()
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
    expect(screen.getByLabelText('默写答案页 1/1')).not.toBeVisible()
  })

  it.each([
    { count: 12, pageSizes: [12] },
    { count: 13, pageSizes: [12, 1] },
    { count: 40, pageSizes: [12, 12, 12, 4] },
  ])('keeps all $count questions numbered once across standard pages', async ({ count, pageSizes }) => {
    const user = userEvent.setup()
    render(<WorksheetStudio api={worksheetApi(numberedWords(count))} />)
    const countInput = await screen.findByRole('spinbutton', { name: '题数' })
    await user.clear(countInput)
    await user.type(countInput, String(count))
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))

    const pages = await screen.findAllByLabelText(/^默写题目页/)
    expect(pages.map(page => within(page).getAllByRole('listitem').length)).toEqual(pageSizes)
    const items = pages.flatMap(page => within(page).getAllByRole('listitem'))
    expect(items[0]).toHaveTextContent(/^1\./)
    expect(items.at(-1)).toHaveTextContent(new RegExp(`^${count}\\.`))
    expect(new Set(items.map(item => item.textContent)).size).toBe(count)
  })

  it('updates writing guides and roomy pagination immediately without changing the selected questions', async () => {
    const user = userEvent.setup()
    render(<WorksheetStudio api={worksheetApi(numberedWords(40))} />)
    const countInput = await screen.findByRole('spinbutton', { name: '题数' })
    await user.clear(countInput)
    await user.type(countInput, '40')
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    const before = (await screen.findAllByLabelText(/^默写题目页/)).flatMap(page => within(page).getAllByRole('listitem').map(item => item.textContent))

    expect(screen.getAllByLabelText('英文四线三格')).toHaveLength(40)
    await user.selectOptions(screen.getByRole('combobox', { name: '每页题数' }), '8')
    const pages = screen.getAllByLabelText(/^默写题目页/)
    expect(pages.map(page => within(page).getAllByRole('listitem').length)).toEqual([8, 8, 8, 8, 8])
    expect(pages.flatMap(page => within(page).getAllByRole('listitem').map(item => item.textContent))).toEqual(before)
    await user.selectOptions(screen.getByRole('combobox', { name: '书写引导' }), 'ruled')
    expect(screen.getAllByLabelText('书写横线')).toHaveLength(40)
    expect(screen.queryByLabelText('英文四线三格')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/^默写答案页/)).toHaveLength(2)
  })

  it('starts with no images and only adds safe local clues when requested', async () => {
    const user = userEvent.setup()
    render(<WorksheetStudio api={worksheetApi([
      { ...apple, image: { ...apple.image, src: 'word-art/apple.svg', alt: 'apple' } },
      { ...apple, id: 'pear', term: 'pear', meaningZh: '梨', image: { ...apple.image, src: 'https://example.com/pear.webp' } },
      { ...apple, id: 'cat', term: 'cat', meaningZh: '猫', image: { ...apple.image, src: 'word-art/../cat.svg' } },
    ])} />)
    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))
    const page = await screen.findByLabelText('默写题目页 1/1')
    expect(within(page).queryAllByRole('img')).toHaveLength(0)
    await user.click(screen.getByRole('checkbox', { name: '添加图片提示' }))
    const images = within(page).getAllByRole('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAccessibleName('苹果')
    expect(images[0]).toHaveAttribute('src', `${import.meta.env.BASE_URL}word-art/apple.svg`)
    expect(page).not.toHaveTextContent('apple')
    fireEvent.error(images[0])
    expect(within(page).queryByRole('img')).not.toBeInTheDocument()
    expect(within(page).getAllByRole('listitem')).toHaveLength(3)
  })

  it('uses Chinese writing lines without picture clues after switching direction', async () => {
    const user = userEvent.setup()
    render(<WorksheetStudio api={worksheetApi([{ ...apple, image: { ...apple.image, src: 'word-art/apple.svg' } }])} />)
    await user.click(await screen.findByRole('checkbox', { name: '添加图片提示' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '题型' }), 'en-zh')
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    const page = await screen.findByLabelText('默写题目页 1/1')
    expect(within(page).getByText('1. apple')).toBeVisible()
    expect(within(page).getByLabelText('书写横线')).toBeInTheDocument()
    expect(within(page).queryByRole('img')).not.toBeInTheDocument()
    expect(page).not.toHaveTextContent('苹果')
  })

  it('does not replace the new direction preview when an older generation finishes late', async () => {
    const user = userEvent.setup()
    let finishOldRequest!: (worksheet: Worksheet) => void
    const staleSheet: Worksheet = {
      id: 'old', title: '旧题型', source: { bookId: 'g3-upper', unit: 1 },
      questions: [{ number: 1, wordId: 'apple', prompt: '苹果', blank: '________', image: apple.image }],
      answers: [{ number: 1, wordId: 'apple', answer: 'apple' }],
    }
    const freshSheet: Worksheet = {
      id: 'new', title: '新题型', source: { bookId: 'g3-upper', unit: 1 },
      questions: [{ number: 1, wordId: 'apple', prompt: 'apple', blank: '________', image: apple.image }],
      answers: [{ number: 1, wordId: 'apple', answer: '苹果' }],
    }
    render(<WorksheetStudio api={worksheetApi([apple])} fetchWorksheet={request => request.direction === 'en-zh' ? Promise.resolve(freshSheet) : new Promise(resolve => { finishOldRequest = resolve })} />)
    await user.click(await screen.findByRole('button', { name: '生成单元默写纸' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '题型' }), 'en-zh')
    await user.click(screen.getByRole('button', { name: '生成单元默写纸' }))
    expect(await screen.findByRole('heading', { name: '新题型' })).toBeVisible()
    await act(async () => finishOldRequest(staleSheet))
    expect(screen.queryByRole('heading', { name: '旧题型' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('默写题目页 1/1')).getByText('1. apple')).toBeVisible()
    expect(within(screen.getByLabelText('默写答案页 1/1')).getByText('苹果')).not.toBeVisible()
  })
})
