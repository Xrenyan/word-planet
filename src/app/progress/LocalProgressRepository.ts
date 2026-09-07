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
  private pending = new Map<string, LearningEvent>()
  private canWrite = false
  private hasSnapshot = false

  constructor(options: LocalProgressRepositoryOptions = {}) {
    let storage: Storage | null = null
    try {
      storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage
      this.hasSnapshot = storage === null
    } catch { /* Storage can be blocked by browser policy. */ }
    this.storage = storage
    this.key = options.key ?? 'word-planet:v1:events'
    this.events = []
    this.refresh()
  }

  private read() {
    if (!this.storage) return []
    try {
      const value: unknown = JSON.parse(this.storage.getItem(this.key) ?? '[]')
      const parsed = LearningEventSchema.array().safeParse(value)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private persist() {
    // A failed read must never turn an unknown or damaged saved record into an empty one.
    if (!this.storage || !this.canWrite) return false
    try {
      if (this.events.length === 0) this.storage.removeItem(this.key)
      else this.storage.setItem(this.key, JSON.stringify(this.events))
      this.pending.clear()
      return true
    } catch {
      return false
    }
  }

  async record(input: LearningEvent): Promise<LocalRecordStatus> {
    this.refresh()
    const event = LearningEventSchema.parse(input)
    const existing = this.events.find((candidate) => candidate.id === event.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('event-id-conflict')
    if (!existing) { this.events = [...this.events, event]; this.pending.set(event.id, event) }
    return this.persist() ? 'saved' : 'memory-only'
  }

  async flush() { return 0 }

  private refresh() {
    if (!this.storage) return
    // Merge only unsaved memory events. Do not resurrect records cleared in another tab.
    const stored = this.read()
    this.canWrite = stored !== null
    if (stored === null) return
    const merged = new Map<string, LearningEvent>()
    for (const event of [...stored, ...this.pending.values()]) {
      const existing = merged.get(event.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
        this.canWrite = false
        return
      }
      merged.set(event.id, event)
    }
    this.events = [...merged.values()]
    this.hasSnapshot = true
  }

  private refreshForRead() {
    this.refresh()
    if (!this.hasSnapshot) throw new Error('storage-read-failed')
  }

  reviewStats(profileId: string): ReviewStat[] {
    this.refreshForRead()
    const byWord = new Map<string, Omit<ReviewStat, 'wordId'>>()
    for (const event of [...this.events].sort((a, b) => a.occurredAt - b.occurredAt)) {
      if (event.profileId !== profileId) continue
      const current = byWord.get(event.wordId) ?? { misses: 0, correct: 0, weakness: 0, lastAttemptAt: 0 }
      if (event.outcome === 'missed') current.misses += 1
      else current.correct += 1
      current.weakness = event.outcome === 'missed' ? current.weakness + 1 : Math.max(0, current.weakness - 1)
      current.lastAttemptAt = Math.max(current.lastAttemptAt, event.occurredAt)
      byWord.set(event.wordId, current)
    }
    return [...byWord.entries()]
      .map(([wordId, value]) => ({ wordId, ...value }))
      .filter((value) => value.weakness > 0)
      .sort((left, right) => right.weakness - left.weakness || right.lastAttemptAt - left.lastAttemptAt || left.wordId.localeCompare(right.wordId))
  }

  dueReviewStats(profileId: string, now = Date.now()) {
    this.refreshForRead()
    const day = 86_400_000
    const intervals = [1, 3, 7, 14, 30]
    const states = new Map<string, ReviewStat & {dueAt: number; stage: number; lastPromotion: number}>()
    for (const event of [...this.events].filter(item => item.profileId === profileId).sort((a,b) => a.occurredAt - b.occurredAt)) {
      const state = states.get(event.wordId) ?? {wordId: event.wordId, misses: 0, correct: 0, weakness: 0, lastAttemptAt: 0, dueAt: 0, stage: -1, lastPromotion: 0}
      state.lastAttemptAt = event.occurredAt
      if (event.outcome === 'missed') {
        state.misses++
        state.weakness++
        state.stage = -1
        state.dueAt = event.occurredAt
      } else {
        state.correct++
        state.weakness = Math.max(0, state.weakness - 1)
        // Immediate retries are practice, not evidence of remembering on a later day.
        if (state.stage === -1 || event.occurredAt - state.lastPromotion >= day) {
          state.stage = Math.min(intervals.length - 1, state.stage + 1)
          state.lastPromotion = event.occurredAt
          state.dueAt = event.occurredAt + intervals[state.stage] * day
        }
      }
      states.set(event.wordId, state)
    }
    return [...states.values()].filter(state => state.weakness > 0 || state.dueAt <= now)
      .sort((a,b) => b.weakness - a.weakness || a.dueAt - b.dueAt)
      .map(({stage, lastPromotion, ...stat}) => stat)
  }

  async getProgress(profileId: string): Promise<ServerProgress> {
    this.refreshForRead()
    const events = this.events.filter((event) => event.profileId === profileId)
    return {
      profileId,
      totalEvents: events.length,
      priorityWordIds: this.dueReviewStats(profileId).map((item) => item.wordId),
      events,
    }
  }

  exportData(profileId: string) {
    this.refreshForRead()
    const events = this.events.filter((event) => event.profileId === profileId)
    return JSON.stringify({ version: 1, storage: 'this-device', exportedAt: Date.now(), profileId, events }, null, 2)
  }

  async clear(profileId: string) {
    this.refresh()
    if (!this.hasSnapshot) throw new Error('storage-clear-failed')
    const previous = this.events
    const deletedEvents = this.events.filter((event) => event.profileId === profileId).length
    this.events = this.events.filter((event) => event.profileId !== profileId)
    if (this.storage && !this.persist()) { this.events = previous; throw new Error('storage-clear-failed') }
    for (const [id, event] of this.pending) if (event.profileId === profileId) this.pending.delete(id)
    return { status: 'cleared' as const, deletedEvents }
  }

  async importData(contents: string, profileId: string) {
    if (contents.length > 5_000_000) throw new Error('backup-too-large')
    const value = JSON.parse(contents)
    if (!value || (value.version !== undefined && value.version !== 1) || value.profileId !== profileId || !Array.isArray(value.events) || value.events.length > 20000) throw new Error('invalid-backup')
    const incoming = value.events.map((event: unknown) => LearningEventSchema.parse(event)) as LearningEvent[]
    if (incoming.some(event => event.profileId !== profileId)) throw new Error('wrong-profile')
    this.refresh()
    const merged = new Map(this.events.map(event => [event.id, event]))
    let imported = 0
    for (const event of incoming) {
      const existing = merged.get(event.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('event-id-conflict')
      if (!existing) { merged.set(event.id, event); imported++ }
    }
    const previous = this.events
    this.events = [...merged.values()]
    if (!this.persist()) { this.events = previous; throw new Error('storage-import-failed') }
    return { imported }
  }
}
