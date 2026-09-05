import { DownloadSimple, ShieldCheck, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { ServerProgress } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'

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

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!api.getProgress) { setStatus('error'); return }
    try {
      setProgress(await api.getProgress(profileId, signal))
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
    if (!api.clearProgress) { setStatus('error'); return }
    try {
      await api.clearProgress(profileId)
      setProgress({ profileId, totalEvents: 0, priorityWordIds: [], events: [] })
      setConfirming(false)
      setStatus('cleared')
      onChanged?.()
    } catch { setStatus('error') }
  }

  async function restore(file?: File) {
    if (!file || !api.importProgress) return
    if (file.size > 5_000_000) { setImportMessage('文件太大了，请选择词星球导出的学习记录备份。'); return }
    setImportMessage('正在检查备份…')
    try {
      const { imported } = await api.importProgress(await file.text(), profileId)
      await load()
      setImportMessage(`已加入 ${imported} 条学习记录，重复的记录会自动跳过。`)
      onChanged?.()
    } catch { setImportMessage('这份备份暂时无法导入。请选择词星球导出的文件，并确认浏览器允许保存网站数据。原有记录未改动。') }
  }

  async function exportProgress() {
    if (!api.getProgress || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const latest = await api.getProgress(profileId)
      download(JSON.stringify({ version: 1, exportedAt: Date.now(), ...latest }, null, 2))
      setProgress(latest)
    } catch { setExportError('备份没有导出成功，请再试一次。先不要清除学习记录。') }
    finally { setExporting(false) }
  }

  return <section className="progress-data-controls" aria-labelledby="progress-data-title">
    <header><ShieldCheck aria-hidden="true" weight="duotone" /><div><p className="status-pill">保存与恢复</p><h2 id="progress-data-title">学习记录备份</h2><p>学习记录默认保存在当前浏览器，录音不会上传。</p></div></header>
    {status === 'loading' && <p role="status">正在读取学习记录…</p>}
    {status === 'error' && <p role="alert">此浏览器暂时无法读取学习记录。</p>}
    {(status === 'ready' || status === 'cleared') && <>
      <p className="progress-data-controls__count" role="status">{status === 'cleared' ? '学习记录已清除' : `此设备已保存 ${progress?.totalEvents ?? 0} 条学习记录`}</p>
      <div className="progress-data-controls__actions">
        <Pressable disabled={!progress || exporting} onClick={() => void exportProgress()}><DownloadSimple aria-hidden="true" />{exporting ? '正在准备备份…' : '导出学习记录'}</Pressable>
        {api.importProgress && <label className="backup-import">导入学习记录<input type="file" accept=".json,application/json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = '' }} /></label>}
        {!confirming && <Pressable disabled={!progress?.totalEvents || exporting} onClick={() => setConfirming(true)}><Trash aria-hidden="true" />清除学习记录</Pressable>}
        {confirming && <div className="progress-data-controls__confirm"><span>确定清除此设备的全部学习记录吗？导出文件和云端备份会保留，再次同步可取回云端记录。没有备份的记录将无法恢复。</span><Pressable onClick={() => void clear()}>确认清除全部记录</Pressable><Pressable onClick={() => setConfirming(false)}>取消</Pressable></div>}
      </div>
      {api.importProgress && <p>换设备时，先在旧设备导出文件，再到新设备导入。</p>}
      {importMessage && <p role="status">{importMessage}</p>}
      {exportError && <p role="alert">{exportError}</p>}
    </>}
  </section>
}
