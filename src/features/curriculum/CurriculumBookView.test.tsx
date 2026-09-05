import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { CurriculumBookView } from './CurriculumBookView'
import { saveBookmark } from '../../learning/bookmark'

const words = ['sport', 'aunt'].map((term, index) => ({
  id: term, bookId: 'g4-upper', unit: index + 1, order: 1, term, meaningZh: ['体育运动', '姑母'][index],
  ipaUk: '/test/', ipaUs: '/test/', image: { src: '/word.png', alt: term, license: 'original' },
  source: { title: 'Unit', url: 'https://example.com/words', page: 82 },
}))

describe('CurriculumBookView', () => {
  it('previews another word in the current unit and scrolls only when preview is requested', async () => {
    const basketball = {
      ...words[0], id: 'basketball', order: 2, term: 'basketball', meaningZh: '篮球',
      source: { title: 'Unit 1 vocabulary', url: 'https://example.com/basketball', page: 83 },
    }
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g4-upper', words: [...words, basketball] }) }
    const onStudy = vi.fn()
    const scrollTargets: HTMLElement[] = []
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: function (this: HTMLElement) { scrollTargets.push(this) },
    })
    try {
      render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={onStudy} />)
      await screen.findByRole('region', { name: '当前单词 sport' })
      expect(scrollTargets).toEqual([])

      await userEvent.click(screen.getByRole('button', { name: '查看 basketball' }))
      const preview = screen.getByRole('region', { name: '当前单词 basketball' })
      expect(within(preview).getByRole('heading', { name: 'basketball' })).toBeVisible()
      expect(within(preview).getByRole('button', { name: '播放英式发音' })).toBeVisible()
      await userEvent.click(within(preview).getByText('家长查看'))
      expect(within(preview).getByRole('link', { name: '查看词表来源' })).toHaveAttribute('href', 'https://example.com/basketball')
      expect(scrollTargets).toEqual([preview])
      expect(onStudy).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: '查看 basketball' }))
      expect(scrollTargets).toEqual([preview, preview])
      await userEvent.click(screen.getByRole('button', { name: '学习 basketball' }))
      expect(onStudy).toHaveBeenCalledWith(basketball)
    } finally {
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('opens a searched word in its own unit for preview without starting study', async () => {
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g4-upper', words }) }
    const onStudy = vi.fn()
    render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={onStudy} />)
    await screen.findByRole('region', { name: '当前单词 sport' })
    await userEvent.type(screen.getByRole('searchbox'), 'aunt')

    await userEvent.click(screen.getByRole('button', { name: '查看 aunt' }))

    expect(screen.getByRole('region', { name: '当前单词 aunt' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Unit 2/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(onStudy).not.toHaveBeenCalled()
  })

  it('clears an empty search back to the previously selected unit', async () => {
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g4-upper', words }) }
    render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={vi.fn()} />)
    await screen.findByRole('region', { name: '当前单词 sport' })
    await userEvent.click(screen.getByRole('button', { name: /Unit 2/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'missing-word')

    await userEvent.click(screen.getByRole('button', { name: '清空搜索' }))

    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('region', { name: '当前单词 aunt' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Unit 2 · 1 个词' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '学习 sport' })).not.toBeInTheDocument()
  })

  it('restores the bookmarked unit and word when returning from study', async () => {
    saveBookmark({ bookId: words[1].bookId, wordId: words[1].id })
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g4-upper', words }) }
    render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={vi.fn()} />)
    expect(await screen.findByRole('region', { name: '当前单词 aunt' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Unit 2/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows cross-unit search results without the unrelated focus card', async () => {
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockResolvedValue({ bookId: 'g4-upper', words }) }
    const onStudy = vi.fn()
    render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={onStudy} />)
    await screen.findByRole('region', { name: '当前单词 sport' })
    await userEvent.type(screen.getByRole('searchbox'), 'aunt')
    expect(screen.queryByRole('region', { name: '当前单词 sport' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '学习 aunt' }))
    expect(onStudy).toHaveBeenCalledWith(words[1])
  })

  it('retries a failed book request without leaving the page', async () => {
    const api: WordPlanetApi = { getBooks: vi.fn(), getWords: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ bookId: 'g4-upper', words }) }
    render(<CurriculumBookView api={api} bookId="g4-upper" onBack={vi.fn()} onStudy={vi.fn()} />)
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: '再试一次' }))
    expect(await screen.findByRole('region', { name: '当前单词 sport' })).toBeVisible()
  })
  it('renders verified words from the selected server book and returns to the library', async () => {
    const onBack = vi.fn()
    const onStudy = vi.fn()
    const api: WordPlanetApi = {
      getBooks: vi.fn(),
      getWords: vi.fn().mockResolvedValue({
        bookId: 'g3-upper',
        words: [{
          id: 'apple', bookId: 'g3-upper', unit: 1, order: 1, term: 'apple', meaningZh: '苹果',
          ipaUk: '/ˈæp.əl/', ipaUs: '/ˈæp.əl/',
          image: { src: '/apple.webp', alt: '苹果', license: 'original' },
          source: { title: 'verified', url: 'test-only:page', page: 1 },
        }],
      }),
    }

    render(<CurriculumBookView api={api} bookId="g3-upper" onBack={onBack} onStudy={onStudy} />)

    expect(await screen.findByRole('heading', { name: 'Unit 1 · 1 个词' })).toBeVisible()
    expect(screen.getAllByText('apple').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '学习 apple' }))
    expect(onStudy).toHaveBeenCalledWith(expect.objectContaining({ id: 'apple', term: 'apple' }))
    const back = screen.getByRole('button', { name: '返回教材' })
    expect(within(back).getByText('返回教材')).toBeVisible()
    await userEvent.click(back)
    expect(onBack).toHaveBeenCalledOnce()
  })
})
