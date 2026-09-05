import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { ParentOverview } from './ParentOverview'

describe('ParentOverview', () => {
  it('shows only metrics derived from real server events', async () => {
    const api = {
      getBooks: vi.fn(), getWords: vi.fn(),
      getProgress: vi.fn().mockResolvedValue({
        profileId: 'local-child', totalEvents: 2, priorityWordIds: ['apple'],
        events: [
          { id: '1', profileId: 'local-child', wordId: 'apple', outcome: 'missed', source: 'spelling', occurredAt: 1 },
          { id: '2', profileId: 'local-child', wordId: 'pear', outcome: 'correct', source: 'game', occurredAt: 2 },
        ],
      }),
    } as WordPlanetApi
    render(<ParentOverview api={api} />)

    expect(await screen.findByText('2')).toBeVisible()
    expect(screen.getByText('50%')).toBeVisible()
    expect(screen.getByText('1')).toBeVisible()
  })
})
