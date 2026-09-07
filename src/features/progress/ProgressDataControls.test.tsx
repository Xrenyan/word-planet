import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WordPlanetApi } from '../../app/api/client'
import { ProgressDataControls } from './ProgressDataControls'
import { LocalProgressRepository } from '../../app/progress/LocalProgressRepository'
import { clearPendingPassport, hasPendingPassport, passportKey, readPassport, readPendingPassport, rememberPendingPassport, writePassport, type Achievement } from '../../games/passport'

const achievement: Achievement = { game: 'bubble', bookId: 'four-upper', unit: 1, level: 1, completedRounds: 2, totalRounds: 2, firstTryCorrect: 1, completedAt: 100 }
const emptyProgress = { profileId: 'local-child', totalEvents: 0, priorityWordIds: [], events: [] }
const apiWithProgress = () => ({ getBooks: vi.fn(), getWords: vi.fn(), getProgress: vi.fn().mockResolvedValue(emptyProgress), importProgress: vi.fn().mockResolvedValue({ imported: 1 }), clearProgress: vi.fn().mockResolvedValue({ status: 'cleared', deletedEvents: 0 }) })
function backup(value: unknown) {
  const contents = JSON.stringify(value)
  const file = new File([contents], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => contents })
  return file
}

beforeEach(() => clearPendingPassport())
afterEach(() => { vi.restoreAllMocks(); clearPendingPassport() })

describe('ProgressDataControls', () => {
  it('offers memory-only answers for backup without claiming they were saved to the device', async () => {
    const repository = new LocalProgressRepository({ storage: null })
    const event = { id: 'pending-answer', profileId: 'local-child', wordId: 'sport', outcome: 'missed' as const, source: 'spelling' as const, occurredAt: 100 }
    expect(await repository.record(event)).toBe('memory-only')
    const download = vi.fn()
    render(<ProgressDataControls api={{ ...apiWithProgress(), getProgress: profileId => repository.getProgress(profileId) }} download={download} />)
    expect(await screen.findByText('当前有 1 条可备份的学习记录')).toBeVisible()
    expect(screen.queryByText(/此设备已保存.*条学习记录/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(JSON.parse(download.mock.calls[0][0]).events).toEqual([event])
  })

  it('includes pending stars and better results in the backup without calling them saved', async () => {
    writePassport([achievement])
    const improved = { ...achievement, firstTryCorrect: 2 }
    const pending = { ...achievement, level: 2 }
    rememberPendingPassport([improved, pending])
    const download = vi.fn()
    render(<ProgressDataControls api={apiWithProgress()} download={download} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(JSON.parse(download.mock.calls[0][0]).gamePassport.achievements).toEqual([improved, pending])
    expect(screen.getByText('此设备已保存 1 颗通关星')).toBeVisible()
    expect(screen.queryByText('此设备已保存 2 颗通关星')).not.toBeInTheDocument()
    expect(screen.getByText(/通关进展仅在本页暂存，尚未保存/)).toBeVisible()
    expect(readPassport()).toEqual([achievement])
    expect(hasPendingPassport()).toBe(true)
  })

  it('clears a pending-only passport only after a successful confirmed clear', async () => {
    rememberPendingPassport([achievement])
    render(<ProgressDataControls api={apiWithProgress()} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    const clear = screen.getByRole('button', { name: '清除记录与通关星' })
    expect(clear).toBeEnabled()
    await userEvent.click(clear)
    expect(readPendingPassport()).toEqual([achievement])
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    await screen.findByText('学习记录和通关星已清除')
    expect(hasPendingPassport()).toBe(false)
    expect(readPassport()).toEqual([])
    expect(screen.queryByText(/通关进展仅在本页暂存/)).not.toBeInTheDocument()
  })

  it.each(['events', 'passport'])('preserves saved and pending stars when clearing %s fails', async failure => {
    writePassport([achievement])
    const pending = { ...achievement, level: 2 }
    rememberPendingPassport([pending])
    const api = apiWithProgress()
    if (failure === 'events') api.clearProgress.mockRejectedValueOnce(new Error('blocked'))
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '清除记录与通关星' }))
    const write = failure === 'passport' ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') }) : undefined
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/仍保留/)
    expect(readPassport()).toEqual([achievement])
    expect(readPendingPassport()).toEqual([pending])
    write?.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    await screen.findByText('学习记录和通关星已清除')
    expect(readPassport()).toEqual([])
    expect(hasPendingPassport()).toBe(false)
  })

  it('merges pending stars into an imported passport and clears the pending notice only after saving', async () => {
    rememberPendingPassport([{ ...achievement, firstTryCorrect: 2 }, { ...achievement, level: 2 }])
    render(<ProgressDataControls api={apiWithProgress()} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [achievement, { ...achievement, level: 3 }] } }))
    await screen.findByText('已加入 1 条学习记录，通关星已合并。重复的记录和通关星会自动跳过。')
    expect(readPassport()).toHaveLength(3)
    expect(readPassport().find(item => item.level === 1)?.firstTryCorrect).toBe(2)
    expect(hasPendingPassport()).toBe(false)
    expect(screen.getByText('此设备已保存 3 颗通关星')).toBeVisible()
    expect(screen.queryByText(/通关进展仅在本页暂存/)).not.toBeInTheDocument()
  })

  it('exports the current passport with the event backup and states the file-only transfer boundary', async () => {
    const download = vi.fn()
    render(<ProgressDataControls api={apiWithProgress()} download={download} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    writePassport([achievement])
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(JSON.parse(download.mock.calls[0][0])).toMatchObject({ version: 1, events: [], gamePassport: { version: 1, achievements: [achievement] } })
    expect(screen.getByText('通关星请用文件备份带走；云同步目前只包含答题记录。')).toBeVisible()
  })

  it('merges a valid imported passport without replacing existing stars or worse results', async () => {
    writePassport([achievement, { ...achievement, level: 2 }])
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    const incoming = [{ ...achievement, firstTryCorrect: 2 }, { ...achievement, level: 3 }]
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: incoming } }))
    await screen.findByText('已加入 1 条学习记录，通关星已合并。重复的记录和通关星会自动跳过。')
    expect(readPassport()).toHaveLength(3)
    expect(readPassport().find(item => item.level === 1)?.firstTryCorrect).toBe(2)
    expect(readPassport()).toContainEqual({ ...achievement, level: 2 })
    expect(api.importProgress).toHaveBeenCalledOnce()
  })

  it.each([null, { version: 2, achievements: [] }, { version: 1, achievements: [{ ...achievement, firstTryCorrect: 3 }] }, { version: 1, achievements: [], fakeStars: 99 }])('rejects malformed passport %j before importing any events', async gamePassport => {
    writePassport([achievement])
    const original = localStorage.getItem(passportKey)
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport }))
    await screen.findByText(/这份备份暂时无法导入/)
    expect(api.importProgress).not.toHaveBeenCalled()
    expect(localStorage.getItem(passportKey)).toBe(original)
  })

  it('keeps current stars when an old backup omits the passport field', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress }))
    await screen.findByText('已加入 1 条学习记录，重复的记录会自动跳过。')
    expect(readPassport()).toEqual([achievement])
  })

  it('does not touch the passport when importing the events fails', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    api.importProgress.mockRejectedValue(new Error('events-blocked'))
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [{ ...achievement, level: 2 }] } }))
    await screen.findByText(/这份备份暂时无法导入/)
    expect(readPassport()).toEqual([achievement])
  })

  it('reports an event-only import if saving the merged passport fails without overwriting old stars', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    const onChanged = vi.fn()
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [{ ...achievement, level: 2 }] } }))
    await screen.findByText('已加入 1 条学习记录，但通关星未恢复。原有通关星仍保留，请保留备份文件再试一次。')
    expect(readPassport()).toEqual([achievement])
    expect(onChanged).toHaveBeenCalledOnce()
    expect(screen.queryByText(/原有记录未改动/)).not.toBeInTheDocument()
  })

  it('allows confirmation and clearing when the device has only passport stars', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    const clear = screen.getByRole('button', { name: '清除记录与通关星' })
    expect(clear).toBeEnabled()
    await userEvent.click(clear)
    expect(readPassport()).toEqual([achievement])
    expect(screen.getByText(/全部学习记录和通关星吗/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    await screen.findByText('学习记录和通关星已清除')
    expect(readPassport()).toEqual([])
  })

  it('reports a partial clear and keeps a retry when the passport cannot be cleared', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    api.getProgress.mockResolvedValue({ ...emptyProgress, totalEvents: 1 })
    const onChanged = vi.fn()
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('当前有 1 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '清除记录与通关星' }))
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('学习记录已清除，但通关星未清除。原有通关星仍保留，请再试一次。')
    expect(readPassport()).toEqual([achievement])
    expect(screen.getByText('当前有 0 条可备份的学习记录')).toBeVisible()
    expect(onChanged).toHaveBeenCalledOnce()
    write.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    await screen.findByText('学习记录和通关星已清除')
    expect(readPassport()).toEqual([])
  })

  it('does not export a backup that silently drops an unreadable local passport', async () => {
    localStorage.setItem(passportKey, '{broken')
    rememberPendingPassport([achievement])
    const download = vi.fn()
    render(<ProgressDataControls api={apiWithProgress()} download={download} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('备份没有导出成功')
    expect(download).not.toHaveBeenCalled()
    expect(localStorage.getItem(passportKey)).toBe('{broken')
    expect(readPendingPassport()).toEqual([achievement])
  })

  it('does not start an event import if existing passport data cannot be safely merged', async () => {
    localStorage.setItem(passportKey, '{broken')
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [achievement] } }))
    await screen.findByText(/这份备份暂时无法导入/)
    expect(api.importProgress).not.toHaveBeenCalled()
    expect(localStorage.getItem(passportKey)).toBe('{broken')
  })

  it('rejects an oversized merged passport before importing the event records', async () => {
    writePassport(Array.from({ length: 2000 }, (_, index) => ({ ...achievement, bookId: `book-${index}` })))
    const original = localStorage.getItem(passportKey)
    const api = apiWithProgress()
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [achievement] } }))
    await screen.findByText(/这份备份暂时无法导入/)
    expect(api.importProgress).not.toHaveBeenCalled()
    expect(localStorage.getItem(passportKey)).toBe(original)
  })

  it('keeps the partial-import explanation visible even if reading the new event count fails', async () => {
    writePassport([achievement])
    const api = apiWithProgress()
    api.getProgress.mockResolvedValueOnce(emptyProgress).mockRejectedValue(new Error('unreadable'))
    render(<ProgressDataControls api={api} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [{ ...achievement, level: 2 }] } }))
    expect(await screen.findByText('已加入 1 条学习记录，但通关星未恢复。原有通关星仍保留，请保留备份文件再试一次。')).toBeVisible()
  })

  it('does not keep an old preservation warning after a later confirmed clear', async () => {
    writePassport([achievement])
    render(<ProgressDataControls api={apiWithProgress()} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    await userEvent.upload(screen.getByLabelText('导入学习记录'), backup({ version: 1, ...emptyProgress, gamePassport: { version: 1, achievements: [{ ...achievement, level: 2 }] } }))
    await screen.findByText(/但通关星未恢复/)
    write.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '清除记录与通关星' }))
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    await screen.findByText('学习记录和通关星已清除')
    expect(screen.queryByText(/原有通关星仍保留/)).not.toBeInTheDocument()
  })

  it('notifies the overview only after a confirmed clear succeeds', async () => {
    const onChanged = vi.fn()
    const clearProgress = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue({ status: 'cleared', deletedEvents: 1 })
    const api = { getBooks: vi.fn(), getWords: vi.fn(), clearProgress, getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: [], events: [] }) }
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('当前有 1 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '清除记录与通关星' }))
    expect(onChanged).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('refreshes the overview after importing a valid backup', async () => {
    const onChanged = vi.fn()
    const api = { getBooks: vi.fn(), getWords: vi.fn(), importProgress: vi.fn().mockResolvedValue({ imported: 1 }), getProgress: vi.fn().mockResolvedValue({ profileId: 'local-child', totalEvents: 1, priorityWordIds: [], events: [] }) }
    render(<ProgressDataControls api={api} onChanged={onChanged} />)
    await screen.findByText('当前有 1 条可备份的学习记录')
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
    await screen.findByText('当前有 0 条可备份的学习记录')
    await userEvent.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).toHaveBeenCalledWith(expect.stringContaining('new-answer'))
    expect(await screen.findByText('当前有 1 条可备份的学习记录')).toBeVisible()
  })

  it('does not download stale data if the fresh export read fails', async () => {
    const download = vi.fn()
    const getProgress = vi.fn().mockResolvedValueOnce({ profileId: 'local-child', totalEvents: 0, priorityWordIds: [], events: [] }).mockRejectedValue(new Error('unavailable'))
    render(<ProgressDataControls api={{ getBooks: vi.fn(), getWords: vi.fn(), getProgress }} download={download} />)
    await screen.findByText('当前有 0 条可备份的学习记录')
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

    expect(await screen.findByText('当前有 1 条可备份的学习记录')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '导出学习记录' }))
    expect(download).toHaveBeenCalledWith(expect.stringContaining('"wordId": "apple"'))

    await user.click(screen.getByRole('button', { name: '清除记录与通关星' }))
    expect(api.clearProgress).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认清除记录与通关星' }))
    expect(api.clearProgress).toHaveBeenCalledWith('local-child')
    expect(await screen.findByText('学习记录和通关星已清除')).toBeVisible()
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
