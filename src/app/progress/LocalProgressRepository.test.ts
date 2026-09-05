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
