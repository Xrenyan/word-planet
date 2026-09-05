import { webcrypto } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningEvent } from '../../../shared/contracts'
import worker, { type VaultDatabase, type VaultStatement } from '../../../backend/worker'
import type { WordPlanetApi } from '../../app/api/client'
import { LocalProgressRepository } from '../../app/progress/LocalProgressRepository'
import { createVault, generatePairingCode, readVault } from './vaultClient'
import { SyncDataControls } from './SyncDataControls'

const apiOrigin = 'https://sync.example'
const profileId = 'this-device-profile'
const sample = (id: string, overrides: Partial<LearningEvent> = {}): LearningEvent => ({ id, profileId, wordId: 'apple', outcome: 'correct', source: 'game', occurredAt: 100, ...overrides })
const snapshot = (events: LearningEvent[]) => ({ version: 1, events: events.map(event => ({ ...event, profileId: 'local-child' })) })
let database: { sqlite: DatabaseSync; DB: VaultDatabase }
let repository: LocalProgressRepository
let api: WordPlanetApi
let requests: number
let clientOptions: { fetch: typeof globalThis.fetch }

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto)
  const sqlite = new DatabaseSync(':memory:')
  const migrations = resolve(process.cwd(), 'backend/drizzle')
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(resolve(migrations, file), 'utf8'))
  const DB: VaultDatabase = { prepare(query) {
    let parameters: (string | number | null)[] = []
    const statement: VaultStatement = {
      bind(...values) { parameters = values; return statement },
      async first<T>() { return (sqlite.prepare(query).get(...parameters) ?? null) as T | null },
      async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...parameters).changes) } } },
    }
    return statement
  } }
  database = { sqlite, DB }
  requests = 0
  repository = new LocalProgressRepository({ storage: localStorage, key: 'test:learning-events' })
  await repository.record(sample('local-event'))
  api = { getBooks: async () => ({ books: [] }), getWords: async () => ({ bookId: '', words: [] }), getProgress: id => repository.getProgress(id), importProgress: (contents, id) => repository.importData(contents, id) }
  clientOptions = { fetch: async (url, init) => {
    requests++
    const request = new Request(url, init)
    request.headers.set('Origin', 'https://xrenyan.github.io')
    request.headers.set('CF-Connecting-IP', '203.0.113.40')
    return worker.fetch(request, { DB: database.DB })
  } }
})
afterEach(() => { database.sqlite.close(); vi.unstubAllGlobals() })

async function consent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /我同意将学习记录加密后备份/ }))
}

async function pair(user: ReturnType<typeof userEvent.setup>, code: string) {
  await consent(user)
  await user.type(screen.getByLabelText('配对码'), code)
  await user.click(screen.getByRole('button', { name: '连接并合并记录' }))
}

describe('SyncDataControls with encrypted Worker and real local repository', () => {
  it('requires opt-in, uploads only normalized learning records, and does not remember a pairing code by default', async () => {
    const user = userEvent.setup()
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    expect(screen.getByRole('button', { name: '创建加密备份' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /在本设备记住配对码/ })).not.toBeChecked()
    expect(requests).toBe(0)
    await consent(user)
    await user.click(screen.getByRole('button', { name: '创建加密备份' }))
    expect(await screen.findByText(/加密备份已创建/)).toBeVisible()
    expect(screen.getByText(/上次成功同步：/)).toBeVisible()
    const code = (screen.getByLabelText('配对码') as HTMLInputElement).value
    const remote = await readVault<{ version: number; events: LearningEvent[] }>(apiOrigin, code, clientOptions)
    expect(remote.data).toEqual(snapshot([sample('local-event')]))
    expect(Object.keys(localStorage).filter(key => key.includes('sync-pairing'))).toHaveLength(0)
    expect(screen.getByText(/180 天/)).toBeVisible()
  })

  it('pairs and merges real records, then deletes the cloud copy only after confirmation', async () => {
    const user = userEvent.setup()
    const recordsAtNotification: string[][] = []
    const onSynced = () => {
      const saved = JSON.parse(localStorage.getItem('test:learning-events') ?? '[]') as LearningEvent[]
      recordsAtNotification.push(saved.map(event => event.id).sort())
    }
    const code = generatePairingCode()
    await createVault(apiOrigin, code, snapshot([sample('remote-event')]), clientOptions)
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} onSynced={onSynced} />)
    await pair(user, code)
    expect(await screen.findByText(/同步完成.*2 条/)).toBeVisible()
    expect((await repository.getProgress(profileId)).events.map(event => event.id).sort()).toEqual(['local-event', 'remote-event'])
    expect(recordsAtNotification).toEqual([['local-event', 'remote-event']])
    expect((await readVault<{ events: LearningEvent[] }>(apiOrigin, code, clientOptions)).data.events).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '删除云端备份' }))
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(1)
    await user.click(screen.getByRole('button', { name: '确认删除云端备份' }))
    expect(await screen.findByText(/云端备份已删除/)).toBeVisible()
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(0)
    expect((await repository.getProgress(profileId)).events).toHaveLength(2)
  })

  it.each([
    { version: 2, events: [] },
    { ...snapshot([sample('remote-event')]), childName: 'not-allowed' },
    { version: 1, events: [{ ...sample('remote-event'), profileId: 'local-child', audio: 'not-allowed' }] },
  ])('rejects an invalid encrypted snapshot without writing or importing it (%j)', async data => {
    const user = userEvent.setup()
    const code = generatePairingCode()
    await createVault(apiOrigin, code, data, clientOptions)
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    await pair(user, code)
    expect(await screen.findByRole('alert')).toHaveTextContent('这份备份暂时无法使用')
    expect((await repository.getProgress(profileId)).events).toEqual([sample('local-event')])
    expect(database.sqlite.prepare('SELECT revision FROM vaults').get()?.revision).toBe(1)
    expect(screen.queryByText(/上次成功同步：/)).not.toBeInTheDocument()
  })

  it('rejects conflicting event IDs before either cloud mutation or local import', async () => {
    const user = userEvent.setup()
    const code = generatePairingCode()
    await createVault(apiOrigin, code, snapshot([sample('local-event', { outcome: 'missed' })]), clientOptions)
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    await pair(user, code)
    expect(await screen.findByRole('alert')).toHaveTextContent('同一条记录')
    expect((await repository.getProgress(profileId)).events).toEqual([sample('local-event')])
    expect(database.sqlite.prepare('SELECT revision FROM vaults').get()?.revision).toBe(1)
  })

  it('remembers only with consent, restores without network access and disconnects without deleting records', async () => {
    const user = userEvent.setup()
    const first = render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    await consent(user)
    await user.click(screen.getByRole('checkbox', { name: /在本设备记住配对码/ }))
    await user.click(screen.getByRole('button', { name: '创建加密备份' }))
    await screen.findByText(/加密备份已创建/)
    const code = (screen.getByLabelText('配对码') as HTMLInputElement).value
    const requestCount = requests
    first.unmount()
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    expect(screen.getByLabelText('配对码')).toHaveValue(code)
    expect(screen.getByRole('checkbox', { name: /在本设备记住配对码/ })).toBeChecked()
    expect(requests).toBe(requestCount)
    await user.click(screen.getByRole('button', { name: '断开此设备' }))
    expect(screen.getByLabelText('配对码')).toHaveValue('')
    expect(Object.keys(localStorage).filter(key => key.includes('sync-pairing'))).toHaveLength(0)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(1)
    expect((await repository.getProgress(profileId)).events).toHaveLength(1)
  })

  it('keeps the current code visible and explains when browser storage prevents remembering it', async () => {
    const user = userEvent.setup()
    const unavailable: Storage = { length: 0, key: () => null, getItem: () => null, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') }, clear: () => { throw new Error('blocked') } }
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} storage={unavailable} />)
    await consent(user)
    await user.click(screen.getByRole('checkbox', { name: /在本设备记住配对码/ }))
    await user.click(screen.getByRole('button', { name: '创建加密备份' }))
    await screen.findByText(/加密备份已创建/)
    expect(screen.getByRole('alert')).toHaveTextContent('无法记住配对码')
    expect(screen.getByLabelText('配对码')).not.toHaveValue('')
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(1)
  })

  it('disables repeat actions while a request is pending and does not offer an unconfigured service', async () => {
    const user = userEvent.setup()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const delayed = { fetch: (async (url, init) => { await gate; return clientOptions.fetch(url, init) }) as typeof globalThis.fetch }
    const view = render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={delayed} />)
    await consent(user)
    const createButton = screen.getByRole('button', { name: '创建加密备份' })
    fireEvent.click(createButton)
    await waitFor(() => expect(createButton).toBeDisabled())
    fireEvent.click(createButton)
    release!()
    await screen.findByText(/加密备份已创建/)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(1)
    view.unmount()
    render(<SyncDataControls api={api} profileId={profileId} />)
    expect(screen.getByText(/暂时无法跨设备同步/)).toBeVisible()
    await consent(user)
    expect(screen.getByRole('button', { name: '创建加密备份' })).toBeDisabled()
  })

  it('does not report success when the local repository cannot persist an imported backup', async () => {
    const user = userEvent.setup()
    const code = generatePairingCode()
    await createVault(apiOrigin, code, snapshot([sample('remote-event')]), clientOptions)
    const blocked: Storage = {
      length: localStorage.length, key: index => localStorage.key(index), getItem: key => localStorage.getItem(key),
      setItem: () => { throw new Error('quota-exceeded') }, removeItem: key => localStorage.removeItem(key), clear: () => localStorage.clear(),
    }
    repository = new LocalProgressRepository({ storage: blocked, key: 'test:learning-events' })
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    await pair(user, code)
    expect(await screen.findByRole('alert')).toHaveTextContent('学习记录未能保存到此设备')
    expect(screen.queryByText(/上次成功同步：/)).not.toBeInTheDocument()
    expect((await repository.getProgress(profileId)).events).toEqual([sample('local-event')])
    expect((await readVault<{ events: LearningEvent[] }>(apiOrigin, code, clientOptions)).data.events).toHaveLength(2)
  })

  it('preserves the recovery code after a lost create response and lets connection confirm the result', async () => {
    const user = userEvent.setup()
    let loseResponse = true
    const uncertain = { fetch: (async (url, init) => {
      const response = await clientOptions.fetch(url, init)
      if (loseResponse) { loseResponse = false; throw new TypeError('connection-lost') }
      return response
    }) as typeof globalThis.fetch }
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={uncertain} />)
    await consent(user)
    await user.click(screen.getByRole('button', { name: '创建加密备份' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法确认是否完成')
    expect(screen.getByLabelText('配对码')).not.toHaveValue('')
    expect(screen.getByRole('button', { name: '创建加密备份' })).toBeDisabled()
    expect(screen.queryByText(/上次成功同步：/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '连接并合并记录' }))
    expect(await screen.findByText(/同步完成.*1 条/)).toBeVisible()
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM vaults').get()?.count).toBe(1)
  })

  it('copies the pairing code only on request and offers manual copying when clipboard access fails', async () => {
    const user = userEvent.setup()
    render(<SyncDataControls api={api} apiOrigin={apiOrigin} profileId={profileId} clientOptions={clientOptions} />)
    await consent(user)
    await user.click(screen.getByRole('button', { name: '创建加密备份' }))
    await screen.findByText(/加密备份已创建/)
    const code = (screen.getByLabelText('配对码') as HTMLInputElement).value
    await user.click(screen.getByRole('button', { name: '复制配对码' }))
    expect(await navigator.clipboard.readText()).toBe(code)
    expect(screen.getByText(/配对码已复制/)).toBeVisible()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
    await user.click(screen.getByRole('button', { name: '复制配对码' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请先显示配对码，再手动复制')
    expect(screen.queryByText(/配对码已复制/)).not.toBeInTheDocument()
  })
})
