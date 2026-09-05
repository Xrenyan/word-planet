import { render, screen } from '@testing-library/react'
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
    await userEvent.click(screen.getByRole('button', { name: '返回教材' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
