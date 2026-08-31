import { createGameRounds, createGameRoundState, type GameRound, type GameWord } from './engine'

export const GUARDIAN_MODES = ['picture-choice', 'audio-choice', 'spelling'] as const
export type GuardianMode = typeof GUARDIAN_MODES[number]
export type GuardianStage = Readonly<{
  id: string
  mode: GuardianMode
  round: GameRound
}>

function fail(message: string): never {
  throw new Error(message)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function stageId(round: GameRound, mode: GuardianMode) {
  return JSON.stringify({ sessionId: round.sessionId, roundIndex: round.roundIndex, mode })
}

/** Reconstructs every nested round through Task 9's strict deterministic validator. */
export function validateGuardianStages(value: unknown): readonly GuardianStage[] {
  if (!Array.isArray(value) || value.length !== GUARDIAN_MODES.length) return fail('guardian requires exactly three stages')
  const stages = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fail('malformed guardian stage')
    const record = candidate as Record<string, unknown>
    if (Object.keys(record).length !== 3 || !Object.hasOwn(record, 'id') || !Object.hasOwn(record, 'mode') || !Object.hasOwn(record, 'round')) {
      return fail('malformed guardian stage')
    }
    const mode = GUARDIAN_MODES[index]
    if (record.mode !== mode) return fail('guardian stage order is invalid')
    const round = createGameRoundState(record.round).round
    if (round.roundCount !== 3 || round.roundIndex !== index) return fail('guardian round schedule is invalid')
    if (record.id !== stageId(round, mode)) return fail('guardian stage identity is invalid')
    return { id: record.id, mode, round }
  })
  const first = stages[0].round
  if (stages.some((stage) => stage.round.sessionId !== first.sessionId || stage.round.sourceSetId !== first.sourceSetId || stage.round.scope !== first.scope)) {
    return fail('guardian stages must share one strict session')
  }
  if (new Set(stages.map((stage) => stage.id)).size !== 3) return fail('guardian stage identities must be unique')
  return deepFreeze(structuredClone(stages)) as readonly GuardianStage[]
}

/** Creates the three canonical shield stages from exactly the caller-supplied set. */
export function createGuardianStages(words: readonly GameWord[] | unknown, seed: number): readonly GuardianStage[] {
  const rounds = createGameRounds(words, seed, 3)
  return validateGuardianStages(rounds.map((round, index) => ({
    id: stageId(round, GUARDIAN_MODES[index]),
    mode: GUARDIAN_MODES[index],
    round,
  })))
}
