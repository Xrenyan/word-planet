import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { CurriculumBrowser } from './CurriculumBrowser'

describe('CurriculumBrowser', () => {
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

    expect(await screen.findByText('12 个正式核验词')).toBeVisible()
    expect(screen.getByRole('button', { name: '三年级下册 等待来源核验' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '打开三年级上册，12个词' }))
    expect(onSelectBook).toHaveBeenCalledWith('g3-upper')
  })
})
