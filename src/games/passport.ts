import { z } from 'zod'

export const gameIds = ['bubble', 'delivery', 'guardian', 'train', 'memory'] as const
export type GameId = typeof gameIds[number]
export const passportKey = 'word-planet:passport:v1'
const AchievementSchema = z.object({
  game: z.enum(gameIds), bookId: z.string().min(1).max(120),
  unit: z.number().int().positive().max(50), level: z.number().int().min(1).max(3),
  completedRounds: z.number().int().positive().max(100),
  totalRounds: z.number().int().positive().max(100),
  firstTryCorrect: z.number().int().nonnegative(), usedHelp: z.boolean().optional(),
  completedAt: z.number().int().nonnegative(),
}).strict().refine(item => item.completedRounds === item.totalRounds && item.firstTryCorrect <= item.totalRounds)
export type Achievement = z.infer<typeof AchievementSchema>
export type Challenge = Pick<Achievement, 'game' | 'bookId' | 'unit' | 'level'>
export type ChallengeResult = Pick<Achievement, 'completedRounds' | 'totalRounds' | 'firstTryCorrect' | 'usedHelp'>
let pendingPassport: Achievement[] = []

export function rememberPendingPassport(achievements: readonly Achievement[]) {
  pendingPassport = mergePassports(pendingPassport, parsePassport({ version: 1, achievements }))
}
export function readPendingPassport(): Achievement[] {
  return pendingPassport.map(item => ({ ...item }))
}
export function hasPendingPassport() { return pendingPassport.length > 0 }
export function clearPendingPassport() { pendingPassport = [] }

export const achievementKey = (item: Challenge) => JSON.stringify([item.game, item.bookId, item.unit, item.level])
export function parsePassport(value: unknown) {
  return z.object({ version: z.literal(1), achievements: z.array(AchievementSchema).max(2000) }).strict().parse(value).achievements
}
export function passportStorage(): Storage | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}
export function readPassport(storage = passportStorage()): Achievement[] {
  try { return readStoredPassport(storage) } catch { return [] }
}
export function readStoredPassport(storage = passportStorage()): Achievement[] {
  if (!storage) throw new Error('passport-storage-unavailable')
  return parsePassport(JSON.parse(storage.getItem(passportKey) ?? '{"version":1,"achievements":[]}'))
}
export function writePassport(achievements: readonly Achievement[], storage = passportStorage()) {
  if (!storage) throw new Error('passport-storage-unavailable')
  const value = { version: 1, achievements }
  parsePassport(value)
  readStoredPassport(storage)
  storage.setItem(passportKey, JSON.stringify(value))
}
export function mergePassports(left: readonly Achievement[], right: readonly Achievement[]) {
  const merged = new Map(left.map(item => [achievementKey(item), item]))
  for (const item of right) {
    const key = achievementKey(item), previous = merged.get(key)
    if (!previous || item.firstTryCorrect > previous.firstTryCorrect || (item.firstTryCorrect === previous.firstTryCorrect && previous.usedHelp && !item.usedHelp)) merged.set(key, item)
  }
  return [...merged.values()]
}
export function awardChallenge(previous: readonly Achievement[], challenge: Challenge, result: ChallengeResult, now = Date.now()) {
  const item = AchievementSchema.safeParse({ ...challenge, ...result, completedAt: now })
  return item.success ? mergePassports(previous, [item.data]) : [...previous]
}
