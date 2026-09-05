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

export function ProgressDataControls({ api, profileId = 'local-child', download = downloadJson }: { api: WordPlanetApi; profileId?: string; download?: (contents: string) => void }) {
  const [progress, setProgress] = useState<ServerProgress | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'cleared'>('loading')
  const [confirming, setConfirming] = useState(false)
  const [importMessage, setImportMessage] = useState('')

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
    } catch { setStatus('error') }
  }

  async function restore(file?: File) {
    if (!file || !api.importProgress) return
    if (file.size > 5_000_000) { setImportMessage('文件过大，请选择本站导出的学习记录。'); return }
    setImportMessage('正在检查备份…')
    try {
      const { imported } = await api.importProgress(await file.text(), profileId)
      await load()
      setImportMessage(`已合并 ${imported} 条记录；重复记录不会重复导入。`)
    } catch { setImportMessage('导入未成功：请检查备份格式与浏览器存储权限。原有记录未改动。') }
  }

  return <section className="progress-data-controls" aria-labelledby="progress-data-title">
    <header><ShieldCheck aria-hidden="true" weight="duotone" /><div><p className="status-pill">孩子的数据</p><h2 id="progress-data-title">记录与隐私</h2><p>学习记录默认保存在此浏览器。下方可自行启用加密备份；录音不上传。</p></div></header>
    {status === 'loading' && <p role="status">正在读取学习记录…</p>}
    {status === 'error' && <p role="alert">此浏览器暂时无法读取学习记录。</p>}
    {(status === 'ready' || status === 'cleared') && <>
      <p className="progress-data-controls__count" role="status">{status === 'cleared' ? '学习记录已清除' : `此设备已保存 ${progress?.totalEvents ?? 0} 条真实作答记录`}</p>
      <div className="progress-data-controls__actions">
        <Pressable disabled={!progress} onClick={() => progress && download(JSON.stringify({ version: 1, exportedAt: Date.now(), ...progress }, null, 2))}><DownloadSimple aria-hidden="true" />导出学习记录</Pressable>
        {api.importProgress && <label className="backup-import">导入学习记录<input type="file" accept=".json,application/json" onChange={event => { void restore(event.target.files?.[0]); event.target.value = '' }} /></label>}
        {!confirming && <Pressable disabled={!progress?.totalEvents} onClick={() => setConfirming(true)}><Trash aria-hidden="true" />清除学习记录</Pressable>}
        {confirming && <div className="progress-data-controls__confirm"><span>只清除此设备的记录，不删除导出文件或云端备份。再次同步会合并云端记录；没有备份则无法恢复。</span><Pressable onClick={() => void clear()}>确认清除全部记录</Pressable><Pressable onClick={() => setConfirming(false)}>取消</Pressable></div>}
      </div>
      {api.importProgress && <p>换手机或电脑：先在旧设备导出，再在新设备导入。本站不会自动同步。</p>}
      {importMessage && <p role="status">{importMessage}</p>}
    </>}
  </section>
}
