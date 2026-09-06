import { DownloadSimple, ShieldCheck, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { ServerProgress } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { clearPendingPassport, hasPendingPassport, mergePassports, parsePassport, readPendingPassport, readStoredPassport, writePassport, type Achievement } from '../../games/passport'

function readSessionPassport() {
  return mergePassports(readStoredPassport(), readPendingPassport())
}

function downloadJson(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `word-planet-progress-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProgressDataControls({ api, profileId = 'local-child', download = downloadJson, onChanged }: { api: WordPlanetApi; profileId?: string; download?: (contents: string) => void; onChanged?: () => void }) {
  const [progress, setProgress] = useState<ServerProgress | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'cleared'>('loading')
  const [confirming, setConfirming] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [passportCount, setPassportCount] = useState<number | null>(null)
  const [passportPending, setPassportPending] = useState(hasPendingPassport)
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState('')
  const busy = exporting || importing || clearing

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!api.getProgress) { setStatus('error'); return }
    try {
      const latest = await api.getProgress(profileId, signal)
      if (signal?.aborted) return
      setProgress(latest)
      try { setPassportCount(readStoredPassport().length) } catch { setPassportCount(null) }
      setPassportPending(hasPendingPassport())
      setStatus('ready')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('error')
    }
  }, [api, profileId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function clear() {
    if (busy) return
    if (!api.clearProgress) { setClearError('暂时无法清除，原有记录和通关星仍保留。'); return }
    setClearing(true)
    setClearError('')
    setImportMessage('')
    setExportError('')
    let eventsCleared = false
    try {
      await api.clearProgress(profileId)
      eventsCleared = true
      setProgress({ profileId, totalEvents: 0, priorityWordIds: [], events: [] })
      writePassport([])
      clearPendingPassport()
      setPassportPending(false)
      setPassportCount(0)
      setConfirming(false)
      setStatus('cleared')
      onChanged?.()
    } catch {
      setClearError(eventsCleared ? '学习记录已清除，但通关星未清除。原有通关星仍保留，请再试一次。' : '暂时无法清除，原有记录和通关星仍保留。')
      if (eventsCleared) { setStatus('ready'); onChanged?.() }
    } finally { setClearing(false) }
  }

  async function restore(file?: File) {
    if (!file || !api.importProgress || busy) return
    if (file.size > 5_000_000) { setImportMessage('文件太大了，请选择词星球导出的学习记录备份。'); return }
    setClearError('')
    setExportError('')
    setImportMessage('正在检查备份…')
    setImporting(true)
    let imported: number | undefined
    try {
      const contents = await file.text()
      const value: unknown = JSON.parse(contents)
      let incomingPassport: Achievement[] | undefined
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'gamePassport')) {
        incomingPassport = parsePassport((value as Record<string, unknown>).gamePassport)
        parsePassport({ version: 1, achievements: mergePassports(readSessionPassport(), incomingPassport) })
      }
      imported = (await api.importProgress(contents, profileId)).imported
      if (incomingPassport !== undefined) {
        writePassport(mergePassports(readSessionPassport(), incomingPassport))
        clearPendingPassport()
        setPassportPending(false)
      }
      await load()
      setImportMessage(incomingPassport === undefined ? `已加入 ${imported} 条学习记录，重复的记录会自动跳过。` : `已加入 ${imported} 条学习记录，通关星已合并。重复的记录和通关星会自动跳过。`)
      onChanged?.()
    } catch {
      if (imported !== undefined) {
        await load()
        setImportMessage(`已加入 ${imported} 条学习记录，但通关星未恢复。原有通关星仍保留，请保留备份文件再试一次。`)
        onChanged?.()
      } else setImportMessage('这份备份暂时无法导入。请选择词星球导出的文件，并确认浏览器允许保存网站数据。原有记录和通关星未改动。')
    } finally { setImporting(false) }
  }

  async function exportProgress() {
    if (!api.getProgress || busy) return
    setExporting(true)
    setExportError('')
    setClearError('')
    setImportMessage('')
    try {
      const latest = await api.getProgress(profileId)
      const savedAchievements = readStoredPassport()
      const achievements = parsePassport({ version: 1, achievements: mergePassports(savedAchievements, readPendingPassport()) })
      download(JSON.stringify({ version: 1, exportedAt: Date.now(), ...latest, gamePassport: { version: 1, achievements } }, null, 2))
      setProgress(latest)
      setPassportCount(savedAchievements.length)
      setPassportPending(hasPendingPassport())
    } catch { setExportError('备份没有导出成功，请再试一次。先不要清除学习记录。') }
    finally { setExporting(false) }
  }

  return <section className="progress-data-controls" aria-labelledby="progress-data-title">
    <header><ShieldCheck aria-hidden="true" weight="duotone" /><div><p className="status-pill">保存与恢复</p><h2 id="progress-data-title">学习记录备份</h2><p>文件备份包含答题记录和通关星，录音不在其中。</p></div></header>
    {status === 'loading' && <p role="status">正在读取学习记录…</p>}
    {status === 'error' && <p role="alert">此浏览器暂时无法读取学习记录。</p>}
    {(status === 'ready' || status === 'cleared') && <>
      <p className="progress-data-controls__count" role="status">{status === 'cleared' ? '学习记录和通关星已清除' : `此设备已保存 ${progress?.totalEvents ?? 0} 条学习记录`}</p>
      <p>{passportCount === null ? '暂时读不到通关星，请保留原数据。' : `此设备已保存 ${passportCount} 颗通关星`}</p>
      {passportPending && <p role="status">还有通关进展仅在本页暂存，尚未保存；导出备份会一并包含。刷新或关闭网页可能丢失。</p>}
      <div className="progress-data-controls__actions">
        <Pressable disabled={!progress || busy} onClick={() => void exportProgress()}><DownloadSimple aria-hidden="true" />{exporting ? '正在准备备份…' : '导出学习记录'}</Pressable>
        {api.importProgress && <label className="backup-import">导入学习记录<input disabled={busy} type="file" accept=".json,application/json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = '' }} /></label>}
        {!confirming && <Pressable disabled={(!progress?.totalEvents && !passportCount && !passportPending) || busy} onClick={() => setConfirming(true)}><Trash aria-hidden="true" />清除记录与通关星</Pressable>}
        {confirming && <div className="progress-data-controls__confirm"><span>确定清除此设备的全部学习记录和通关星吗？导出文件和云端答题备份会保留。通关星只能从文件备份恢复，没有备份将无法找回。</span><Pressable disabled={busy} onClick={() => void clear()}>{clearing ? '正在清除…' : '确认清除记录与通关星'}</Pressable><Pressable disabled={clearing} onClick={() => setConfirming(false)}>取消</Pressable></div>}
      </div>
      {api.importProgress && <p>换设备时，先在旧设备导出文件，再到新设备导入。</p>}
      <p>通关星请用文件备份带走；云同步目前只包含答题记录。</p>
    </>}
    {importMessage && <p role="status">{importMessage}</p>}
    {exportError && <p role="alert">{exportError}</p>}
    {clearError && <p role="alert">{clearError}</p>}
  </section>
}
