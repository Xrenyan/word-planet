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
  if (code === 'event-id-conflict') return '两台设备对同一条记录保存了不同内容，已停止合并且未导入。请先分别导出本地记录，保留原始备份。'
  if (code === 'invalid-sync-snapshot' || code === 'invalid-data') return '备份格式或记录内容不符合要求，未导入。请检查配对码是否来自词星球。'
  if (code === 'invalid-pairing-code') return '配对码格式不正确，请完整复制旧设备显示的配对码后重试。'
  if (code === 'not-found') return '未找到可访问的云端备份：请检查配对码；备份也可能已删除或过期。本地记录仍保留。'
  if (code === 'decryption-failed') return '备份解密失败，可能是配对码不正确或备份已损坏。请核对后重试，本地记录仍保留。'
  if (code === 'revision-conflict') return '另一台设备正在更新备份，本次同步未完成。请稍后点击手动同步重试。'
  if (code === 'rate-limited') return `操作过于频繁，请${error instanceof VaultError && error.retryAfter ? `约 ${Math.ceil(error.retryAfter / 60)} 分钟后` : '稍后'}重试。本地记录仍保留。`
  if (code === 'payload-too-large') return '学习记录超过当前云端备份容量，请继续使用本地导出保存完整记录。'
  if (code === 'local-import-failed' || code === 'storage-import-failed') return '云端记录已核对，但本机记录未能保存。请检查浏览器存储权限后再次手动同步；暂未记为同步成功。'
  if (code === 'encryption-unavailable') return '当前浏览器无法使用安全加密，请使用最新版浏览器打开 HTTPS 页面，或继续本地导出。'
  if (code === 'network-error' || code === 'request-timeout') return '网络未连接或请求超时，结果尚未确认。请保留当前配对码，网络恢复后连接或手动同步重试。'
  if (code === 'capacity-reached' || code === 'service-unavailable') return '云端服务暂时不可用或容量已满，请稍后重试；仍可导出本地记录。'
  if (code === 'invalid-api-origin' || code === 'origin-not-allowed') return '云端服务配置暂不可用，请继续使用本地导出。'
  if (code === 'clipboard-unavailable') return '浏览器未允许复制。请先显示配对码，再手动复制并妥善保存。'
  return '操作未完成，请检查网络和浏览器存储权限后重试。本地记录仍保留。'
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
  } catch { return { code: '', lastSynced: null as number | null, warning: '无法读取本设备保存的配对信息，请重新输入配对码。' } }
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
  const [message, setMessage] = useState(initial.code ? '已读取本设备记住的配对码；尚未检查云端，请按需手动同步。' : '')
  const [error, setError] = useState('')
  const [storageWarning, setStorageWarning] = useState(initial.warning)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = !!apiOrigin && !!api.getProgress && !!api.importProgress

  function saveCode(pairingCode: string, synced: number | null) {
    try {
      if (!deviceStorage) throw new Error()
      deviceStorage.setItem(storageKey, JSON.stringify({ version: 1, code: pairingCode, lastSynced: synced }))
      setStorageWarning('')
    } catch { setStorageWarning('浏览器无法记住配对码，本次只保留在当前页面。请显示并妥善保存配对码，关闭页面后可能无法恢复备份。') }
  }

  function forgetCode() {
    try { deviceStorage?.removeItem(storageKey); setStorageWarning(''); return true } catch {
      setStorageWarning('浏览器无法移除已保存的配对码。请在浏览器设置中清除此网站数据；清除前先导出本地学习记录。')
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
    void run('正在加密并创建备份…', async () => {
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
    void run('正在读取、校验并合并记录…', async () => {
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
      setMessage(`同步完成，两端已合并 ${checked.events.length} 条记录。新产生的记录请再次手动同步。`)
      onSynced?.()
    })
  }

  function disconnect() {
    if (busyRef.current) return
    forgetCode()
    setCode(''); setActiveCode(''); setLastSynced(null); setRemember(false); setRevealed(false); setConfirmDelete(false); setError('')
    setMessage('此设备已断开，云端备份和本地学习记录仍保留。再次连接需要原配对码。')
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
      setMessage('云端备份已删除，本地学习记录仍保留。其他设备无法再通过此配对码连接。')
    })
  }

  return <section className="sync-data-controls" aria-labelledby={`${identity}-title`} aria-busy={!!busy}>
    <header><ShieldCheck aria-hidden="true" weight="duotone" /><div><p className="status-pill">可选 · 手动同步</p><h2 id={`${identity}-title`}>加密备份与设备配对</h2><p>无需账号。仅在你操作时备份学习记录，不上传姓名或录音。</p></div></header>
    <p className="sync-data-controls__notice">配对码等同密码，请勿分享给他人；丢失后无法找回。云端备份在 180 天未更新后失效。本地导出仍可继续使用，请另存一份重要记录。</p>
    {!ready && <p role="status">云端服务尚未启用，当前请使用本地导出和导入。</p>}
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
      <p id={`${identity}-code-help`}>先在旧设备创建备份，再在新设备输入完整配对码并连接。本站不会自动同步。</p>
    </div>
    <div className="sync-data-controls__actions">
      {!activeCode && <><Pressable disabled={!!busy || !ready || !consented || !!code.trim()} onClick={create}><CloudArrowUp aria-hidden="true" />创建加密备份</Pressable><Pressable disabled={!!busy || !ready || !consented || !code.trim()} onClick={synchronize}><Link aria-hidden="true" />连接并合并记录</Pressable></>}
      {activeCode && <><Pressable disabled={!!busy || !ready || !consented} onClick={synchronize}><ArrowsClockwise aria-hidden="true" />手动同步</Pressable><Pressable disabled={!!busy} onClick={disconnect}>断开此设备</Pressable>{!confirmDelete && <Pressable disabled={!!busy || !apiOrigin} onClick={() => setConfirmDelete(true)}><Trash aria-hidden="true" />删除云端备份</Pressable>}</>}
    </div>
    {confirmDelete && <div className="sync-data-controls__confirm"><p>确认删除此配对码对应的云端备份？所有已配对设备都会失去此云端副本，本地记录保留。</p><Pressable disabled={!!busy} onClick={removeCloudCopy}>确认删除云端备份</Pressable><Pressable disabled={!!busy} onClick={() => setConfirmDelete(false)}>取消</Pressable></div>}
    {lastSynced && <p className="sync-data-controls__last">上次成功同步：<time dateTime={new Date(lastSynced).toISOString()}>{new Date(lastSynced).toLocaleString('zh-CN')}</time></p>}
    {(busy || message) && <p role="status" aria-live="polite">{busy || message}</p>}
    {error && <p role="alert">{error}</p>}
    {storageWarning && <p role="alert">{storageWarning}</p>}
  </section>
}
