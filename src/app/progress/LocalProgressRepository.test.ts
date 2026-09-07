import { describe, expect, it } from 'vitest'
import type { LearningEvent } from '../../../shared/contracts'
import { LocalProgressRepository } from './LocalProgressRepository'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const events: LearningEvent[] = [
  { id: 'e1', profileId: 'local-child', wordId: 'apple', outcome: 'missed', source: 'spelling', occurredAt: 100 },
  { id: 'e2', profileId: 'local-child', wordId: 'apple', outcome: 'missed', source: 'game', occurredAt: 200 },
  { id: 'e3', profileId: 'local-child', wordId: 'apple', outcome: 'correct', source: 'recognition', occurredAt: 300 },
]

describe('LocalProgressRepository', () => {
  describe.each([
    ['invalid JSON', '{unfinished'],
    ['unknown format', JSON.stringify({ version: 2, events: [events[0]] })],
    ['partially invalid events', JSON.stringify([events[0], { ...events[1], outcome: 'unknown' }])],
    ['conflicting event IDs', JSON.stringify([events[0], { ...events[0], outcome: 'correct' }])],
  ])('when saved data contains %s', (_description, raw) => {
    it('rejects progress reads and exports until a trusted archive can be loaded', async () => {
      const storage = new MemoryStorage()
      storage.setItem('word-planet:v1:events', raw)
      const repository = new LocalProgressRepository({ storage })

      await expect(repository.getProgress('local-child')).rejects.toThrow('storage-read-failed')
      expect(() => repository.exportData('local-child')).toThrow('storage-read-failed')
      expect(() => repository.reviewStats('local-child')).toThrow('storage-read-failed')
      expect(() => repository.dueReviewStats('local-child')).toThrow('storage-read-failed')
      expect(storage.getItem('word-planet:v1:events')).toBe(raw)
    })

    it('keeps new attempts in memory without overwriting the original data', async () => {
      const storage = new MemoryStorage()
      storage.setItem('word-planet:v1:events', raw)
      const repository = new LocalProgressRepository({ storage })

      const status = await repository.record(events[2])

      expect(storage.getItem('word-planet:v1:events')).toBe(raw)
      expect(status).toBe('memory-only')
      await expect(repository.getProgress('local-child')).rejects.toThrow('storage-read-failed')
      expect(() => repository.exportData('local-child')).toThrow('storage-read-failed')

      storage.setItem('word-planet:v1:events', JSON.stringify([events[0]]))
      expect((await repository.getProgress('local-child')).events).toEqual([events[0], events[2]])
      expect(await repository.record(events[1])).toBe('saved')
      expect(JSON.parse(storage.getItem('word-planet:v1:events')!)).toEqual([events[0], events[2], events[1]])
    })

    it('rejects backup import without changing the original data', async () => {
      const storage = new MemoryStorage()
      storage.setItem('word-planet:v1:events', raw)
      const repository = new LocalProgressRepository({ storage })
      const backup = JSON.stringify({ version: 1, profileId: 'local-child', events })

      await expect(repository.importData(backup, 'local-child')).rejects.toThrow('storage-import-failed')
      expect(storage.getItem('word-planet:v1:events')).toBe(raw)
      await expect(repository.getProgress('local-child')).rejects.toThrow('storage-read-failed')
    })

    it('rejects clearing a profile without deleting the original data', async () => {
      const storage = new MemoryStorage()
      storage.setItem('word-planet:v1:events', raw)
      const repository = new LocalProgressRepository({ storage })

      await expect(repository.clear('local-child')).rejects.toThrow('storage-clear-failed')
      expect(storage.getItem('word-planet:v1:events')).toBe(raw)
    })
  })

  it('rejects an unreadable initial archive and recovers with pending attempts intact', async () => {
    const storage = new MemoryStorage()
    storage.setItem('word-planet:v1:events', JSON.stringify([events[0]]))
    const readSaved = storage.getItem.bind(storage)
    storage.getItem = () => { throw new Error('temporarily blocked') }
    const repository = new LocalProgressRepository({ storage })

    expect(await repository.record(events[1])).toBe('memory-only')
    await expect(repository.getProgress('local-child')).rejects.toThrow('storage-read-failed')
    expect(() => repository.exportData('local-child')).toThrow('storage-read-failed')

    storage.getItem = readSaved
    expect((await repository.getProgress('local-child')).events).toEqual([events[0], events[1]])
    expect(JSON.parse(repository.exportData('local-child')).events).toEqual([events[0], events[1]])
  })

  it('does not report an empty archive when the browser blocks access to storage itself', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('storage access denied') } })
    try {
      const repository = new LocalProgressRepository()
      expect(await repository.record(events[0])).toBe('memory-only')
      await expect(repository.getProgress('local-child')).rejects.toThrow('storage-read-failed')
      expect(() => repository.exportData('local-child')).toThrow('storage-read-failed')
      await expect(repository.clear('local-child')).rejects.toThrow('storage-clear-failed')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('still clears explicitly requested memory-only progress', async () => {
    const repository = new LocalProgressRepository({ storage: null })
    await repository.record(events[0])

    expect(await repository.clear('local-child')).toEqual({ status: 'cleared', deletedEvents: 1 })
    expect((await repository.getProgress('local-child')).events).toEqual([])
  })

  it('preserves unreadable saved data and pending attempts until reading recovers', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalProgressRepository({ storage })
    await repository.record(events[0])
    const readSaved = storage.getItem.bind(storage)
    const raw = JSON.stringify([events[0], { ...events[1], id: 'other-tab' }])
    storage.setItem('word-planet:v1:events', raw)
    storage.getItem = () => { throw new Error('temporarily blocked') }

    const status = await repository.record(events[1])

    expect(readSaved('word-planet:v1:events')).toBe(raw)
    expect(status).toBe('memory-only')
    await expect(repository.importData(JSON.stringify({ version: 1, profileId: 'local-child', events }), 'local-child')).rejects.toThrow('storage-import-failed')
    await expect(repository.clear('local-child')).rejects.toThrow('storage-clear-failed')
    expect(readSaved('word-planet:v1:events')).toBe(raw)
    expect((await repository.getProgress('local-child')).events).toEqual([events[0], events[1]])

    storage.getItem = readSaved
    expect(await repository.record(events[2])).toBe('saved')
    expect(JSON.parse(readSaved('word-planet:v1:events')!)).toEqual([events[0], { ...events[1], id: 'other-tab' }, events[1], events[2]])
  })

  it('does not restore saved records cleared by another tab after a read failure', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalProgressRepository({ storage })
    await repository.record(events[0])
    const otherTab = new LocalProgressRepository({ storage })
    const readSaved = storage.getItem.bind(storage)
    storage.getItem = () => { throw new Error('temporarily blocked') }
    expect(await repository.record(events[1])).toBe('memory-only')

    storage.getItem = readSaved
    await otherTab.clear('local-child')
    expect(await repository.record(events[2])).toBe('saved')
    expect(JSON.parse(readSaved('word-planet:v1:events')!)).toEqual([events[1], events[2]])
  })

  it('does not overwrite another tab when a pending attempt conflicts with a saved event ID', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalProgressRepository({ storage })
    const save = storage.setItem.bind(storage)
    storage.setItem = () => { throw new Error('quota exceeded') }
    expect(await repository.record(events[0])).toBe('memory-only')
    storage.setItem = save
    const raw = JSON.stringify([{ ...events[0], outcome: 'correct' }])
    storage.setItem('word-planet:v1:events', raw)

    const status = await repository.record(events[1])

    expect(storage.getItem('word-planet:v1:events')).toBe(raw)
    expect(status).toBe('memory-only')
    expect((await repository.getProgress('local-child')).events).toEqual([events[0], events[1]])
  })

  it('brings a previously correct word back when spaced review is due', async () => {
    const repository = new LocalProgressRepository({ storage: new MemoryStorage() })
    await repository.record({...events[0], outcome: 'correct', occurredAt: Date.now() - 86_400_001})
    expect((await repository.getProgress('local-child')).priorityWordIds).toEqual(['apple'])
  })
  it('does not treat an immediate repeated answer as long-term retention', async () => {
    const repository = new LocalProgressRepository({ storage: new MemoryStorage() })
    const yesterday = Date.now() - 86_410_000
    await repository.record({...events[0], outcome: 'correct', occurredAt: yesterday})
    await repository.record({...events[1], outcome: 'correct', occurredAt: yesterday + 1000})
    expect((await repository.getProgress('local-child')).priorityWordIds).toEqual(['apple'])
  })
  it('keeps already saved progress when storage temporarily becomes unreadable', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalProgressRepository({ storage })
    await repository.record(events[0])
    storage.getItem = () => { throw new Error('temporarily blocked') }
    expect((await repository.getProgress('local-child')).events).toEqual([events[0]])
    expect(JSON.parse(repository.exportData('local-child')).events).toEqual([events[0]])
  })

  it('merges backups without duplicating events and rejects conflicting records atomically', async () => {
    const repository = new LocalProgressRepository({ storage: new MemoryStorage() })
    await repository.record(events[0])
    const backup = JSON.stringify({version: 1, profileId: 'local-child', events})
    expect(await repository.importData(backup, 'local-child')).toEqual({ imported: 2 })
    expect(await repository.importData(backup, 'local-child')).toEqual({ imported: 0 })
    await expect(repository.importData(JSON.stringify({version: 1, profileId: 'local-child', events: [{...events[0], outcome: 'correct'}]}), 'local-child')).rejects.toThrow('event-id-conflict')
    expect((await repository.getProgress('local-child')).events).toEqual(events)
  })
  it('persists valid attempts under the versioned device-local key', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalProgressRepository({ storage })

    expect(await repository.record(events[0])).toBe('saved')
    expect(storage.getItem('word-planet:v1:events')).toContain('"wordId":"apple"')
    expect((await repository.getProgress('local-child')).totalEvents).toBe(1)
  })

  it('derives the review priority from real misses minus correct answers', async () => {
    const repository = new LocalProgressRepository({ storage: new MemoryStorage() })
    for (const event of events) await repository.record(event)

    const progress = await repository.getProgress('local-child')

    expect(progress.priorityWordIds).toEqual(['apple'])
    expect(repository.reviewStats('local-child')).toEqual([{ wordId: 'apple', misses: 2, correct: 1, weakness: 1, lastAttemptAt: 300 }])
  })

  it('continues in memory and reports the truth when browser storage rejects writes', async () => {
    const storage = new MemoryStorage()
    storage.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError') }
    const repository = new LocalProgressRepository({ storage })

    expect(await repository.record(events[0])).toBe('memory-only')
    expect((await repository.getProgress('local-child')).events).toEqual([events[0]])
  })

  it('exports and clears only the current browser data', async () => {
    const repository = new LocalProgressRepository({ storage: new MemoryStorage() })
    await repository.record(events[0])

    expect(JSON.parse(repository.exportData('local-child')).events).toHaveLength(1)
    expect(await repository.clear('local-child')).toEqual({ status: 'cleared', deletedEvents: 1 })
    expect((await repository.getProgress('local-child')).totalEvents).toBe(0)
  })
})
