import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { ProgressDataControls } from './ProgressDataControls'

describe('ProgressDataControls', () => {
  it('notifies the overview only after a confirmed clear succeeds', async () => {
    const onChanged = vi.fn()
    const clearProgress = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue({ status: 'cleared', deletedEvents: 1 })
    const api = { getBooks: vi.fn(), getWords: vi.fn(), clearProgress, getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: [], events: [] }) }
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('此设备已保存 1 条学习记录')
    await userEvent.click(screen.getByRole('button', { name: '清除学习记录' }))
    expect(onChanged).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '确认清除全部记录' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('refreshes the overview after importing a valid backup', async () => {
    const onChanged = vi.fn()
    const api = { getBooks: vi.fn(), getWords: vi.fn(), importProgress: vi.fn().mockResolvedValue({ imported: 1 }), getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: [], events: [] }) }
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('此设备已保存 1 条学习记录')
    const file = new File(['{"version":1}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => '{"version":1}' })
    await userEvent.upload(screen.getByLabelText('导入学习记录'), file)
    await screen.findByText('已加入 1 条学习记录，重复的记录会自动跳过。')
    expect(onChanged).toHaveBeenCalledOnce()
  })
  it('reads fresh events at export time instead of downloading the initial snapshot', async () => {
    const download = vi.fn()
    const getProgress = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', totalEvents: 0, priorityWordIds: [], events: [] })
      .mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: [], events: [{ id: 'new-answer', wordId: 'aunt', outcome: 'correct' }] })
    render(<ProgressDataControls api={{ getBooks: vi.fn(), getWords: vi.fn(), getProgress }} download={download} />)
    await screen.findByText('此设备已保存 0 条学习记录')
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).toHaveBeenCalledWith(expect.stringContaining('new-answer'))
    expect(await screen.findByText('此设备已保存 1 条学习记录')).toBeVisible()
  })

  it('does not download stale data if the fresh export read fails', async () => {
    const download = vi.fn()
    const getProgress = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', totalEvents: 0, priorityWordIds: [], events: [] }).mockRejectedValue(new Error('unavailable'))
    render(<ProgressDataControls api={{ getBooks: vi.fn(), getWords: vi.fn(), getProgress }} download={download} />)
    await screen.findByText('此设备已保存 0 条学习记录')
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('备份没有导出成功')
  })
  it('exports the real device-local event stream and clears it only after confirmation', async () => {
    const user = userEvent.setup()
    const download = vi.fn()
    const api = {
      getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: ['apple'], events: [{ id: 'one', profileId: 'local-child', wordId: 'apple', outcome: 'missed', source: 'game', occurredAt: 100 }] }),
      clearProgress: vi.fn().mockResolvedValue({ status: 'cleared', deletedEvents: 1 }),
    } as unknown as WordPlanetApi

    const onChanged = vi.fn()
    render(<ProgressDataControls api={api} download={download} onChanged={onChanged} />)

    expect(await screen.findByText('此设备已保存 1 条学习记录')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).toHaveBeenCalledWith(expect.stringContaining('"wordId": "apple"'))

    await user.click(screen.getByRole('button', { name: '清除学习记录' }))
    expect(api.clearProgress).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认清除全部记录' }))
    expect(api.clearProgress).toHaveBeenCalledWith('local-child')
    expect(await screen.findByText('学习记录已清除')).toBeVisible()
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
