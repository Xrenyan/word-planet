import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { ProgressDataControls } from './ProgressDataControls'

describe('ProgressDataControls', () => {
  it('exports the real device-local event stream and clears it only after confirmation', async () => {
    const user = userEvent.setup()
    const download = vi.fn()
    const api = {
      getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: ['apple'], events: [{ id: 'one', profileId: 'local-child', wordId: 'apple', outcome: 'missed', source: 'game', occurredAt: 100 }] }),
      clearProgress: vi.fn().mockResolvedValue({ status: 'cleared', deletedEvents: 1 }),
    } as unknown as WordPlanetApi

    render(<ProgressDataControls api={api} download={download} />)

    expect(await screen.findByText('此设备已保存 1 条真实作答记录')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).toHaveBeenCalledWith(expect.stringContaining('"wordId": "apple"'))

    await user.click(screen.getByRole('button', { name: '清除学习记录' }))
    expect(api.clearProgress).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认清除全部记录' }))
    expect(api.clearProgress).toHaveBeenCalledWith('local-child')
    expect(await screen.findByText('学习记录已清除')).toBeVisible()
  })
})
