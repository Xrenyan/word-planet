import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { CurriculumBookView } from './CurriculumBookView'

describe('CurriculumBookView', () => {
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
