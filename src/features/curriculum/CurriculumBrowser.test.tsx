import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { CurriculumBrowser } from './CurriculumBrowser'

describe('CurriculumBrowser', () => {
  it('opens a book from its visible title and supports keyboard activation on the same entry', async () => {
    const onSelectBook = vi.fn()
    const api: WordPlanetApi = {
      getBooks: vi.fn().mockResolvedValue({ books: [
        { id: 'g4-upper', label: '四年级上册', grade: 4, semester: 'upper', status: 'verified', verifiedWordCount: 165 },
      ] }),
      getWords: vi.fn(),
    }
    const user = userEvent.setup()
    render(<CurriculumBrowser api={api} onSelectBook={onSelectBook} />)

    await user.click(await screen.findByText('四年级上册'))
    expect(onSelectBook).toHaveBeenCalledWith('g4-upper')
    expect(onSelectBook).toHaveBeenCalledTimes(1)

    const bookButton = screen.getByRole('button', { name: '打开四年级上册，165个词' })
    bookButton.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onSelectBook).toHaveBeenCalledTimes(3)
  })

  it('loads all book slots and opens only a book with verified words', async () => {
    const onSelectBook = vi.fn()
    const api: WordPlanetApi = {
      getBooks: vi.fn().mockResolvedValue({ books: [
        { id: 'g3-upper', label: '三年级上册', grade: 3, semester: 'upper', status: 'verified', verifiedWordCount: 12 },
        { id: 'g3-lower', label: '三年级下册', grade: 3, semester: 'lower', status: 'awaiting-source', verifiedWordCount: 0 },
      ] }),
      getWords: vi.fn(),
    }
    render(<CurriculumBrowser api={api} onSelectBook={onSelectBook} />)

    expect(await screen.findByText('12 个单词')).toBeVisible()
    expect(screen.getByRole('button', { name: '三年级下册 词表准备中' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '打开三年级上册，12个词' }))
    expect(onSelectBook).toHaveBeenCalledWith('g3-upper')
  })
})
