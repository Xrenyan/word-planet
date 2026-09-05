import { CloudArrowUp, Link, ShieldCheck, ArrowsClockwise, Trash } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'
import { z } from 'zod'
import { LearningEventSchema, type LearningEvent } from '../../../shared/contracts'
import type { WordPlanetApi } from '../../app/api/client'
import { Pressable } from '../../ui/Pressable'
import { createVault, deleteVault, generatePairingCode, parsePairingCode, syncVault, VaultError, type VaultClientOptions } from './vaultClient'
import './sync-data-controls.css'

export type SyncDataControlsProps = {
  api: WordPlanetApi
  apiOrigin?: string
  profileId?: string
  onSynced?: () => void
  storage?: Storage | null
  clientOptions?: VaultClientOptions
}

const SnapshotSchema = z.object({ version: z.literal(1), events: z.array(LearningEventSchema).max(20_000) }).strict()
type ProgressSnapshot = z.infer<typeof SnapshotSchema>
const ANONYMOUS_PROFILE = 'local-child'

function validateSnapshot(value: unknown): ProgressSnapshot {
  const parsed = SnapshotSchema.safeParse(value)
  if (!parsed.success || parsed.data.events.some(event => event.profileId !== ANONYMOUS_PROFILE)) throw new Error('invalid-sync-snapshot')
  const events = new Map<string, LearningEvent>()
  for (const event of parsed.data.events) {
    const existing = events.get(event.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('event-id-conflict')
    events.set(event.id, event)
  }
  return { version: 1, events: [...events.values()].sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id)) }
}

function mergeSnapshots(local: unknown, remote: unknown) {
  return validateSnapshot({ version: 1, events: [...validateSnapshot(local).events, ...validateSnapshot(remote).events] })
}

function errorMessage(error: unknown) {
  const code = error instanceof VaultError ? error.code : error instanceof Error ? error.message : ''
  if (code === 'event-id-conflict') return '两台设备保存的同一条记录不一致，暂时无法合并。请先分别导出学习记录，保留备份。'
  if (code === 'invalid-sync-snapshot' || code === 'invalid-data') return '这份备份暂时无法使用，原有记录未改动。请确认配对码来自词星球。'
  if (code === 'invalid-pairing-code') return '配对码不完整或有误，请完整复制另一台设备上的配对码。'
  if (code === 'not-found') return '没有找到这份备份。请核对配对码；备份也可能已删除或过期。此设备的记录仍保留。'
  if (code === 'decryption-failed') return '无法打开这份备份，请核对配对码。备份也可能已损坏，此设备的记录仍保留。'
  if (code === 'revision-conflict') return '另一台设备正在同步。请稍后再点“手动同步”。'
  if (code === 'rate-limited') return `操作有些频繁，请${error instanceof VaultError && error.retryAfter ? `约 ${Math.ceil(error.retryAfter / 60)} 分钟后` : '稍后'}再试。此设备的记录仍保留。`
  if (code === 'payload-too-large') return '记录较多，暂时无法完成云端备份。请导出学习记录，保存完整备份。'
  if (code === 'local-import-failed' || code === 'storage-import-failed') return '学习记录未能保存到此设备，同步尚未完成。请确认浏览器允许保存网站数据，再试一次。'
  if (code === 'encryption-unavailable') return '当前浏览器暂时无法安全备份。请更新浏览器后重试，或先导出学习记录。'
  if (code === 'network-error' || code === 'request-timeout') return '网络连接不稳定，暂时无法确认是否完成。请保留配对码，连接恢复后再试一次。'
  if (code === 'capacity-reached' || code === 'service-unavailable') return '暂时无法备份或同步。请稍后再试，也可以先导出学习记录。'
  if (code === 'invalid-api-origin' || code === 'origin-not-allowed') return '暂时无法备份或同步。请先导出学习记录，保存一份备份。'
  if (code === 'clipboard-unavailable') return '浏览器未允许复制。请先显示配对码，再手动复制并妥善保存。'
  return '操作未完成，请稍后再试。此设备的学习记录仍保留。'
}

function resolveStorage(storage: Storage | null | undefined) {
  try { return storage === undefined ? globalThis.localStorage : storage } catch { return null }
}

function readRemembered(storage: Storage | null, key: string) {
  try {
    const saved = storage?.getItem(key)
    if (!saved) return { code: '', lastSynced: null as number | null, warning: '' }
    const value: unknown = JSON.parse(saved)
    const parsed = z.object({ version: z.literal(1), code: z.string(), lastSynced: z.number().int().positive().nullable() }).strict().parse(value)
    parsePairingCode(parsed.code)
    return { code: parsed.code, lastSynced: parsed.lastSynced, warning: '' }
  } catch { return { code: '', lastSynced: null as number | null, warning: '无法找到此设备保存的配对码，请重新输入。' } }
}

export function SyncDataControls(props: SyncDataControlsProps) {
  return <SyncDataControlsSession key={`${props.apiOrigin ?? ''}:${props.profileId ?? 'local-child'}`} {...props} />
}

function SyncDataControlsSession({ api, apiOrigin, profileId = 'local-child', onSynced, storage, clientOptions }: SyncDataControlsProps) {
  const identity = useId()
  const [deviceStorage] = useState(() => resolveStorage(storage))
  const storageKey = `word-planet:sync-pairing:v1:${apiOrigin ?? ''}:${profileId}`
  const [initial] = useState(() => readRemembered(deviceStorage, storageKey))
  const [code, setCode] = useState(initial.code)
  const [activeCode, setActiveCode] = useState(initial.code)
  const [lastSynced, setLastSynced] = useState<number | null>(initial.lastSynced)
  const [remember, setRemember] = useState(!!initial.code)
  const [consented, setConsented] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState('')
  const busyRef = useRef(false)
  const [message, setMessage] = useState(initial.code ? '已找到此设备保存的配对码，尚未同步。需要更新记录时，请点击“手动同步”。' : '')
  const [error, setError] = useState('')
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = !!apiOrigin && !!api.getProgress && !!api.importProgress

  function saveCode(pairingCode: string, synced: number | null) {
    try {
      if (!deviceStorage) throw new Error()
      deviceStorage.setItem(storageKey, JSON.stringify({ version: 1, code: pairingCode, lastSynced: synced }))
      setStorageWarning('')
    } catch { setStorageWarning('浏览器无法记住配对码。请先显示并另行保存，关闭页面后可能无法找回备份。') }
  }

  function forgetCode() {
    try { deviceStorage?.removeItem(storageKey); setStorageWarning(''); return true } catch {
      setStorageWarning('浏览器未能忘记配对码。请先导出学习记录，再到浏览器设置中清除词星球的网站数据。')
      return false
    }
  }

  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(label); setError(''); setMessage('')
    try { await action() } catch (failure) { setError(errorMessage(failure)) } finally { busyRef.current = false; setBusy('') }
  }

  async function localSnapshot() {
    if (!api.getProgress) throw new Error('local-progress-unavailable')
    const progress = await api.getProgress(profileId)
    if (progress.profileId !== profileId || !Array.isArray(progress.events)) throw new Error('invalid-sync-snapshot')
    const events = progress.events.map(candidate => {
      const parsed = LearningEventSchema.safeParse(candidate)
      if (!parsed.success || parsed.data.profileId !== profileId) throw new Error('invalid-sync-snapshot')
      return { ...parsed.data, profileId: ANONYMOUS_PROFILE }
    })
    return validateSnapshot({ version: 1, events })
  }

  function recordSuccess(pairingCode: string) {
    const completedAt = Date.now()
    setCode(pairingCode); setActiveCode(pairingCode); setLastSynced(completedAt)
    if (remember) saveCode(pairingCode, completedAt)
  }

  function create() {
    if (!ready || !consented || code.trim()) return
    void run('正在保存加密备份…', async () => {
      const data = await localSnapshot()
      const pairingCode = generatePairingCode()
      // Preserve recovery material before the request, including when its result
      // is uncertain because a network response is lost.
      setCode(pairingCode)
      if (remember) saveCode(pairingCode, null)
      await createVault(apiOrigin!, pairingCode, data, clientOptions)
      recordSuccess(pairingCode)
      setMessage(`加密备份已创建，保存了 ${data.events.length} 条记录。请妥善保存配对码。`)
    })
  }

  function synchronize() {
    if (!ready || !consented) return
    void run('正在同步学习记录…', async () => {
      const pairingCode = (activeCode || code).trim()
      parsePairingCode(pairingCode)
      const local = await localSnapshot()
      const result = await syncVault<ProgressSnapshot>(apiOrigin!, pairingCode, local, mergeSnapshots, clientOptions)
      const checked = validateSnapshot(result.data)
      try {
        await api.importProgress!(JSON.stringify({ version: 1, profileId, events: checked.events.map(event => ({ ...event, profileId })) }), profileId)
      } catch (failure) {
        if (failure instanceof Error && failure.message === 'event-id-conflict') throw failure
        throw new Error('local-import-failed')
      }
      recordSuccess(pairingCode)
      setMessage(`同步完成，已合并 ${checked.events.length} 条学习记录。学完后请再次手动同步。`)
      onSynced?.()
    })
  }

  function disconnect() {
    if (busyRef.current) return
    forgetCode()
    setCode(''); setActiveCode(''); setLastSynced(null); setRemember(false); setRevealed(false); setConfirmDelete(false); setError('')
    setMessage('已断开此设备。云端备份和此设备的学习记录仍保留，再次连接需要原配对码。')
  }

  function copyCode() {
    if (!code.trim()) return
    void run('正在复制配对码…', async () => {
      try { await navigator.clipboard.writeText(code.trim()) } catch { throw new Error('clipboard-unavailable') }
      setMessage('配对码已复制。请仅粘贴到自己的另一台设备，勿分享给他人。')
    })
  }

  function removeCloudCopy() {
    if (!apiOrigin || !activeCode || !confirmDelete) return
    void run('正在删除云端备份…', async () => {
      await deleteVault(apiOrigin, activeCode, clientOptions)
      forgetCode()
      setCode(''); setActiveCode(''); setLastSynced(null); setRemember(false); setRevealed(false); setConfirmDelete(false)
      setMessage('云端备份已删除，此设备的学习记录仍保留。其他设备无法再用这个配对码连接。')
    })
  }

  return <section className="sync-data-controls" aria-labelledby={`${identity}-title`} aria-busy={!!busy}>
    <header><ShieldCheck aria-hidden="true" weight="duotone" /><div><p className="status-pill">手动同步</p><h2 id={`${identity}-title`}>换设备继续学</h2><p>不用注册，按需备份学习记录。姓名和录音不会上传。</p></div></header>
    <p className="sync-data-controls__notice">请像保管密码一样保管配对码，勿分享给他人，丢失后无法找回。云端备份连续 180 天未更新会失效。</p>
    {!ready && <p role="status">暂时无法跨设备同步。可以先导出学习记录，再到新设备导入。</p>}
    <label className="sync-data-controls__check"><input type="checkbox" checked={consented} disabled={!!busy} onChange={event => setConsented(event.target.checked)} />我同意将学习记录加密后备份到云端</label>
    <label className="sync-data-controls__check"><input type="checkbox" checked={remember} disabled={!!busy} onChange={event => {
      if (event.target.checked) { setRemember(true); if (activeCode) saveCode(activeCode, lastSynced) }
      else if (forgetCode()) setRemember(false)
    }} />在本设备记住配对码（仅建议在个人设备使用）</label>
    <div className="sync-data-controls__pairing">
      <label htmlFor={`${identity}-code`}>配对码</label>
      <div className="sync-data-controls__code-row">
        <input id={`${identity}-code`} type={revealed ? 'text' : 'password'} value={code} onChange={event => setCode(event.target.value)} readOnly={!!activeCode} disabled={!!busy} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder="粘贴另一台设备的配对码" aria-describedby={`${identity}-code-help`} />
        <div className="sync-data-controls__code-buttons"><Pressable disabled={!!busy || !code} onClick={() => setRevealed(value => !value)}>{revealed ? '隐藏配对码' : '显示配对码'}</Pressable><Pressable disabled={!!busy || !code.trim()} onClick={copyCode}>复制配对码</Pressable></div>
      </div>
      <p id={`${identity}-code-help`}>已有备份？粘贴另一台设备的配对码，即可连接。</p>
    </div>
    <div className="sync-data-controls__actions">
      {!activeCode && <><Pressable disabled={!!busy || !ready || !consented || !!code.trim()} onClick={create}><CloudArrowUp aria-hidden="true" />创建加密备份</Pressable><Pressable disabled={!!busy || !ready || !consented || !code.trim()} onClick={synchronize}><Link aria-hidden="true" />连接并合并记录</Pressable></>}
      {activeCode && <><Pressable disabled={!!busy || !ready || !consented} onClick={synchronize}><ArrowsClockwise aria-hidden="true" />手动同步</Pressable><Pressable disabled={!!busy} onClick={disconnect}>断开此设备</Pressable>{!confirmDelete && <Pressable disabled={!!busy || !apiOrigin} onClick={() => setConfirmDelete(true)}><Trash aria-hidden="true" />删除云端备份</Pressable>}</>}
    </div>
    {confirmDelete && <div className="sync-data-controls__confirm"><p>确定删除云端备份吗？其他设备也将无法用这个配对码恢复记录，各设备已保存的记录不会删除。</p><Pressable disabled={!!busy} onClick={removeCloudCopy}>确认删除云端备份</Pressable><Pressable disabled={!!busy} onClick={() => setConfirmDelete(false)}>取消</Pressable></div>}
    <details className="sync-data-controls__guide"><summary>怎么使用</summary><ol><li>在旧设备点击“创建加密备份”，并保存好配对码。</li><li>在新设备打开词星球，粘贴配对码，点击“连接并合并记录”。</li><li>学完后，在当前设备点击“手动同步”；换设备时，也请先同步一次。词星球不会自动同步。</li></ol><p>重要的学习记录，建议再导出一份文件备份。</p></details>
    {lastSynced && <p className="sync-data-controls__last">上次成功同步：<time dateTime={new Date(lastSynced).toISOString()}>{new Date(lastSynced).toLocaleString('zh-CN')}</time></p>}
    {(busy || message) && <p role="status" aria-live="polite">{busy || message}</p>}
    {error && <p role="alert">{error}</p>}
    {storageWarning && <p role="alert">{storageWarning}</p>}
  </section>
}
