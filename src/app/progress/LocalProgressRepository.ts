import { LearningEventSchema, type LearningEvent, type ServerProgress } from '../../../shared/contracts'

export type LocalRecordStatus = 'saved' | 'memory-only'

type LocalProgressRepositoryOptions = {
  storage?: Storage | null
  key?: string
}

type ReviewStat = {
  wordId: string
  misses: number
  correct: number
  weakness: number
  lastAttemptAt: number
}

export class LocalProgressRepository {
  private readonly storage: Storage | null
  private readonly key: string
  private events: LearningEvent[]

  constructor(options: LocalProgressRepositoryOptions = {}) {
    this.storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage
    this.key = options.key ?? 'word-planet:v1:events'
    this.events = this.read()
  }

  private read() {
    if (!this.storage) return []
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.key) ?? '[]')
      if (!Array.isArray(value)) return []
      return value.flatMap((candidate) => {
        const parsed = LearningEventSchema.safeParse(candidate)
        return parsed.success ? [parsed.data] : []
      })
    } catch {
      return []
    }
  }

  private persist() {
    if (!this.storage) return false
    try {
      if (this.events.length === 0) this.storage.removeItem(this.key)
      else this.storage.setItem(this.key, JSON.stringify(this.events))
      return true
    } catch {
      return false
    }
  }

  async record(input: LearningEvent): Promise<LocalRecordStatus> {
    const event = LearningEventSchema.parse(input)
    const existing = this.events.find((candidate) => candidate.id === event.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('event-id-conflict')
    if (!existing) this.events = [...this.events, event]
    return this.persist() ? 'saved' : 'memory-only'
  }

  async flush() { return 0 }

  reviewStats(profileId: string): ReviewStat[] {
    const byWord = new Map<string, Omit<ReviewStat, 'wordId' | 'weakness'>>()
    for (const event of this.events) {
      if (event.profileId !== profileId) continue
      const current = byWord.get(event.wordId) ?? { misses: 0, correct: 0, lastAttemptAt: 0 }
      if (event.outcome === 'missed') current.misses += 1
      else current.correct += 1
      current.lastAttemptAt = Math.max(current.lastAttemptAt, event.occurredAt)
      byWord.set(event.wordId, current)
    }
    return [...byWord.entries()]
      .map(([wordId, value]) => ({ wordId, ...value, weakness: value.misses - value.correct }))
      .filter((value) => value.weakness > 0)
      .sort((left, right) => right.weakness - left.weakness || right.lastAttemptAt - left.lastAttemptAt || left.wordId.localeCompare(right.wordId))
  }

  async getProgress(profileId: string): Promise<ServerProgress> {
    const events = this.events.filter((event) => event.profileId === profileId)
    return {
      profileId,
      totalEvents: events.length,
      priorityWordIds: this.reviewStats(profileId).map((item) => item.wordId),
      events,
    }
  }

  exportData(profileId: string) {
    const events = this.events.filter((event) => event.profileId === profileId)
    return JSON.stringify({ version: 1, storage: 'this-device', exportedAt: Date.now(), profileId, events }, null, 2)
  }

  async clear(profileId: string) {
    const deletedEvents = this.events.filter((event) => event.profileId === profileId).length
    this.events = this.events.filter((event) => event.profileId !== profileId)
    this.persist()
    return { status: 'cleared' as const, deletedEvents }
  }
}
