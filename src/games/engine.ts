import { z } from 'zod'

import { ImageSchema, VocabularyWordSchema } from '../curriculum/schema'
import type { VocabularyWord, WordImage } from '../curriculum/types'
import type { PublicMatchedGameWord } from '../data/publicMatchedGameWord'

const MAX_ROUNDS = 20

export type GameWord = VocabularyWord | PublicMatchedGameWord
export type GameScope = 'formal' | 'source-matched'
export type GameAttempt = Readonly<{ wordId: string; outcome: 'correct' | 'missed' }>
export type GameChoice = Readonly<{ id: string; term: string; meaningZh: string; image: WordImage }>
export type GameRound = Readonly<{
  seed: number
  scope: GameScope
  sourceSetId: string
  sessionId: string
  roundId: string
  sessionSeed: number
  roundCount: number
  roundIndex: number
  sourceWords: readonly GameWord[]
  target: GameChoice
  choices: readonly GameChoice[]
}>
export type GameRoundState = Readonly<{ round: GameRound; status: 'answering' | 'complete'; attempts: readonly GameAttempt[] }>
export type GameResult = Readonly<{ rounds: number; correctRounds: number; attempts: readonly GameAttempt[] }>
export function gameScopeLabel(scope: GameScope) { return scope === 'source-matched' ? '公开来源匹配 · 待教材页复核' : '已核验教材词汇' }

const DemoAudioVariantSchema = z.object({ source: z.literal('system-voice'), locale: z.enum(['en-GB', 'en-US']) }).strict()
const PublicMatchedGameWordSchema = z.object({
  scope: z.literal('公开来源匹配'), disclaimer: z.literal('待手中教材页复核'), id: z.string().trim().min(1), term: z.string().trim().min(1), meaningZh: z.string().trim().min(1),
  partOfSpeech: z.string().trim().min(1), ipaUk: z.string().trim().min(1), ipaUs: z.string().trim().min(1), grade: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  semester: z.enum(['upper', 'lower']), unit: z.number().int().positive(), listType: z.literal('source-matched'), image: ImageSchema,
  audio: z.object({ uk: DemoAudioVariantSchema.extend({ locale: z.literal('en-GB') }), us: DemoAudioVariantSchema.extend({ locale: z.literal('en-US') }) }).strict(), reviewStatus: z.literal('source-matched'),
}).strict()
const VerifiedFormalWordSchema = VocabularyWordSchema.refine((word) => word.reviewStatus === 'verified', 'formal game words must be verified')
const GameSourceWordSchema = z.union([PublicMatchedGameWordSchema, VerifiedFormalWordSchema])
const GameChoiceSchema = z.object({ id: z.string().trim().min(1), term: z.string().trim().min(1), meaningZh: z.string().trim().min(1), image: ImageSchema }).strict()
const SeedSchema = z.number().refine((value) => Number.isSafeInteger(value) && value >= 0, 'a non-negative integer seed is required')

function sameChoice(left: z.output<typeof GameChoiceSchema>, right: z.output<typeof GameChoiceSchema>) {
  return left.id === right.id && left.term === right.term && left.meaningZh === right.meaningZh && left.image.src === right.image.src && left.image.alt === right.image.alt && left.image.license === right.image.license && left.image.reviewed === right.image.reviewed
}
function sameOrderedChoices(left: readonly z.output<typeof GameChoiceSchema>[], right: readonly z.output<typeof GameChoiceSchema>[]) { return left.length === right.length && left.every((choice, index) => sameChoice(choice, right[index]!)) }

const GameRoundSchema = z.object({
  seed: SeedSchema,
  scope: z.enum(['formal', 'source-matched']),
  sourceSetId: z.string().min(1),
  sessionId: z.string().min(1),
  roundId: z.string().min(1),
  sessionSeed: SeedSchema,
  roundCount: z.number().int().min(1).max(MAX_ROUNDS),
  roundIndex: z.number().int().min(0),
  sourceWords: z.array(GameSourceWordSchema).min(1),
  target: GameChoiceSchema,
  choices: z.array(GameChoiceSchema).min(1).max(4),
}).strict().superRefine((round, context) => {
  const sourceScope = sourceScopeOf(round.sourceWords)
  if (!sourceScope || sourceScope !== round.scope) context.addIssue({ code: 'custom', path: ['scope'], message: 'round source words must have one matching scope' })
  if (new Set(round.sourceWords.map((word) => word.id)).size !== round.sourceWords.length) context.addIssue({ code: 'custom', path: ['sourceWords'], message: 'round source words must be unique' })
  if (round.roundIndex >= round.roundCount) context.addIssue({ code: 'custom', path: ['roundIndex'], message: 'round index must belong to session' })
  if (sourceScope && round.sourceSetId !== createSourceSetId(sourceScope, round.sourceWords)) context.addIssue({ code: 'custom', path: ['sourceSetId'], message: 'round source-set identity must match complete source words' })
  if (round.sessionId !== createSessionId(round.sourceSetId, round.sessionSeed, round.roundCount)) context.addIssue({ code: 'custom', path: ['sessionId'], message: 'round session identity is invalid' })
  if (round.seed !== deriveRoundSeed(round.sessionSeed, round.roundIndex)) context.addIssue({ code: 'custom', path: ['seed'], message: 'round seed must be derived from the session and round index' })
  if (round.roundId !== createRoundId(round.sessionId, round.roundIndex, round.seed)) context.addIssue({ code: 'custom', path: ['roundId'], message: 'round identity is invalid' })
  if (new Set(round.choices.map((choice) => choice.id)).size !== round.choices.length) context.addIssue({ code: 'custom', path: ['choices'], message: 'round choices must be unique' })
  const sourceChoices = new Map(round.sourceWords.map((word) => [word.id, choiceFromSourceWord(word)]))
  if (round.choices.some((choice) => !sourceChoices.has(choice.id) || !sameChoice(choice, sourceChoices.get(choice.id)!))) context.addIssue({ code: 'custom', path: ['choices'], message: 'round choices must come from its complete source set' })
  const targetChoice = round.choices.find((choice) => choice.id === round.target.id)
  if (!targetChoice || !sameChoice(targetChoice, round.target)) context.addIssue({ code: 'custom', path: ['target'], message: 'round target must exactly match a current choice' })
  const canonicalWords = canonicalSourceWords(round.sourceWords)
  if (round.sourceWords.some((word, index) => word.id !== canonicalWords[index]!.id)) context.addIssue({ code: 'custom', path: ['sourceWords'], message: 'round source words must use canonical order' })
  const expected = buildExpectedRoundContent(canonicalWords, round.sessionSeed, round.roundIndex)
  if (!sameOrderedChoices(round.choices, expected.choices)) context.addIssue({ code: 'custom', path: ['choices'], message: 'round choices must match the deterministic schedule' })
  if (!sameChoice(round.target, expected.target)) context.addIssue({ code: 'custom', path: ['target'], message: 'round target must match the deterministic schedule' })
})
const GameAttemptSchema = z.object({ wordId: z.string().trim().min(1), outcome: z.enum(['correct', 'missed']) }).strict()
const GameRoundStateSchema = z.object({ round: GameRoundSchema, status: z.enum(['answering', 'complete']), attempts: z.array(GameAttemptSchema) }).strict().superRefine((state, context) => {
  const choiceIds = new Set(state.round.choices.map((choice) => choice.id))
  const correctAttempts = state.attempts.filter((attempt) => attempt.outcome === 'correct')
  for (const [index, attempt] of state.attempts.entries()) {
    if (!choiceIds.has(attempt.wordId)) context.addIssue({ code: 'custom', path: ['attempts', index, 'wordId'], message: 'attempt must reference a current choice' })
    if (attempt.outcome === 'correct' && attempt.wordId !== state.round.target.id) context.addIssue({ code: 'custom', path: ['attempts', index], message: 'only the target may be correct' })
    if (attempt.outcome === 'missed' && attempt.wordId === state.round.target.id) context.addIssue({ code: 'custom', path: ['attempts', index], message: 'target cannot be recorded as missed' })
  }
  if (correctAttempts.length > 1) context.addIssue({ code: 'custom', path: ['attempts'], message: 'a round may have only one terminal correct answer' })
  if (correctAttempts.length === 1 && state.attempts.at(-1) !== correctAttempts[0]) context.addIssue({ code: 'custom', path: ['attempts'], message: 'the correct answer must be terminal' })
  if (state.status === 'answering' && correctAttempts.length !== 0) context.addIssue({ code: 'custom', path: ['status'], message: 'an answering state cannot contain a correct answer' })
  if (state.status === 'complete' && correctAttempts.length !== 1) context.addIssue({ code: 'custom', path: ['status'], message: 'a completed state needs exactly one correct answer' })
})

type GameSourceWord = z.output<typeof GameSourceWordSchema>
type ValidatedWords = Readonly<{ scope: GameScope; choices: readonly GameChoice[]; sourceWords: readonly GameSourceWord[]; sourceSetId: string }>
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value) } return value }
function cloneAndFreeze<T>(value: T): T { return deepFreeze(structuredClone(value)) }
function fail(issue: string): never { throw new Error(issue) }
function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }
function canonicalize(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => compareStable(left, right)).map(([key, child]) => [key, canonicalize(child)])); return value }
function canonicalSourceWords<T extends { id: string }>(words: readonly T[]): readonly T[] { return [...words].sort((left, right) => compareStable(left.id, right.id)) }
function sourceScopeOf(words: readonly GameSourceWord[]): GameScope | null { const scopes = words.map((word) => ('scope' in word && word.scope === '公开来源匹配' ? 'source-matched' : 'formal')); return scopes.length > 0 && scopes.every((scope) => scope === scopes[0]) ? scopes[0] : null }
function createSourceSetId(scope: GameScope, words: readonly GameSourceWord[]): string { return JSON.stringify(canonicalize({ scope, words: canonicalSourceWords(words) })) }
function createSessionId(sourceSetId: string, sessionSeed: number, roundCount: number): string { return JSON.stringify({ sourceSetId, sessionSeed, roundCount }) }
function createRoundId(sessionId: string, roundIndex: number, seed: number): string { return JSON.stringify({ sessionId, roundIndex, seed }) }
function deriveRoundSeed(sessionSeed: number, roundIndex: number): number { return (sessionSeed + Math.imul(roundIndex + 1, 0x9e3779b1)) >>> 0 }
function choiceFromSourceWord(word: GameSourceWord): GameChoice { return { id: word.id, term: word.term, meaningZh: word.meaningZh, image: { ...word.image } } }

function parseGameWord(value: unknown): Readonly<{ scope: GameScope; choice: GameChoice; sourceWord: GameSourceWord }> {
  const parsed = GameSourceWordSchema.safeParse(value)
  if (parsed.success) {
    const scope: GameScope = 'scope' in parsed.data && parsed.data.scope === '公开来源匹配' ? 'source-matched' : 'formal'
    return { scope, choice: choiceFromSourceWord(parsed.data), sourceWord: parsed.data }
  }
  return fail('malformed or unverified game word')
}
function validateWords(words: unknown): ValidatedWords {
  if (!Array.isArray(words) || words.length === 0) return fail('at least one game word is required')
  const parsed = words.map(parseGameWord)
  const scope = parsed[0].scope
  if (parsed.some((word) => word.scope !== scope)) return fail('cannot mix different game word scopes')
  if (new Set(parsed.map((word) => word.choice.id)).size !== parsed.length) return fail('game word ids must be unique')
  const canonical = [...parsed].sort((left, right) => compareStable(left.choice.id, right.choice.id))
  const sourceWords = canonical.map((word) => word.sourceWord)
  return { scope, choices: canonical.map((word) => word.choice), sourceWords, sourceSetId: createSourceSetId(scope, sourceWords) }
}
function parseRound(round: unknown): GameRound { const parsed = GameRoundSchema.safeParse(round); if (!parsed.success) return fail('malformed game round'); return cloneAndFreeze(parsed.data) as GameRound }
function parseState(state: unknown): GameRoundState { const parsed = GameRoundStateSchema.safeParse(state); if (!parsed.success) return fail('malformed game state or attempt'); return cloneAndFreeze(parsed.data) as GameRoundState }
function nextRandom(seed: number): readonly [number, number] { const next = (seed + 0x6d2b79f5) >>> 0; let value = next; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return [next, ((value ^ (value >>> 14)) >>> 0) / 4294967296] }
function seededShuffle<T>(values: readonly T[], seed: number): readonly T[] { const shuffled = [...values]; let cursor = seed >>> 0; for (let index = shuffled.length - 1; index > 0; index -= 1) { const [next, random] = nextRandom(cursor); cursor = next; const swapIndex = Math.floor(random * (index + 1)); [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]] } return shuffled }
function buildExpectedRoundContent(sourceWords: readonly GameSourceWord[], sessionSeed: number, roundIndex: number): Readonly<{ choices: readonly GameChoice[]; target: GameChoice }> { const choicesFromSource = canonicalSourceWords(sourceWords).map(choiceFromSourceWord); let previousTargetId: string | undefined; let expected: Readonly<{ choices: readonly GameChoice[]; target: GameChoice }> | undefined; for (let index = 0; index <= roundIndex; index += 1) { const seed = deriveRoundSeed(sessionSeed, index); const choices = seededShuffle(choicesFromSource, seed ^ 0xa5a5a5a5).slice(0, 4); const sampledTarget = seededShuffle(choices, seed ^ 0x3c6ef372)[0]!; const target = sampledTarget.id === previousTargetId && choices.length > 1 ? choices.find((choice) => choice.id !== previousTargetId)! : sampledTarget; expected = { choices, target }; previousTargetId = target.id } return expected ?? fail('round index must be non-negative') }
function createRoundFromValidated(supplied: ValidatedWords, sessionSeed: number, roundCount: number, roundIndex: number): GameRound { const seed = deriveRoundSeed(sessionSeed, roundIndex); const content = buildExpectedRoundContent(supplied.sourceWords, sessionSeed, roundIndex); const sessionId = createSessionId(supplied.sourceSetId, sessionSeed, roundCount); return parseRound({ seed, scope: supplied.scope, sourceSetId: supplied.sourceSetId, sessionId, roundId: createRoundId(sessionId, roundIndex, seed), sessionSeed, roundCount, roundIndex, sourceWords: supplied.sourceWords, ...content }) }

/** Creates one immutable, deterministic round from exactly the caller's word set. */
export function createGameRound(words: readonly GameWord[] | unknown, seed: number): GameRound { const parsedSeed = SeedSchema.safeParse(seed); if (!parsedSeed.success) return fail('a non-negative integer seed is required'); return createRoundFromValidated(validateWords(words), parsedSeed.data, 1, 0) }
export function createGameRoundState(round: GameRound | unknown): GameRoundState { return parseState({ round: parseRound(round), status: 'answering', attempts: [] }) }
/** Records only a visible choice. A completed round is clone-safe and idempotent. */
export function recordGameAnswer(state: GameRoundState | unknown, wordId: string): GameRoundState { const parsedState = parseState(state); if (typeof wordId !== 'string' || wordId.trim().length === 0 || !parsedState.round.choices.some((choice) => choice.id === wordId)) return fail('answer must be a current choice'); if (parsedState.status === 'complete') return parsedState; const outcome = wordId === parsedState.round.target.id ? 'correct' : 'missed'; return parseState({ ...parsedState, status: outcome === 'correct' ? 'complete' : 'answering', attempts: [...parsedState.attempts, { wordId, outcome }] }) }
export function validateRoundCount(rounds: unknown): number { if (typeof rounds !== 'number' || !Number.isInteger(rounds)) return fail('round count must be an integer'); if (rounds < 1 || rounds > MAX_ROUNDS) return fail(`round count must be between 1 and ${MAX_ROUNDS}`); return rounds }
/** Finite deterministic orchestration used by the UI; immediate targets never repeat when avoidable. */
export function createGameRounds(words: readonly GameWord[] | unknown, seed: number, rounds: number): readonly GameRound[] { const parsedSeed = SeedSchema.safeParse(seed); if (!parsedSeed.success) return fail('a non-negative integer seed is required'); const count = validateRoundCount(rounds); const validated = validateWords(words); const result: GameRound[] = []; for (let index = 0; index < count; index += 1) result.push(createRoundFromValidated(validated, parsedSeed.data, count, index)); return cloneAndFreeze(result) as readonly GameRound[] }
export function createGameResult(states: readonly GameRoundState[] | unknown): GameResult { if (!Array.isArray(states) || states.length < 1 || states.length > MAX_ROUNDS) return fail('a finite completed state list is required'); const completedStates = states.map(parseState); if (completedStates.some((state) => state.status !== 'complete')) return fail('game results require completed states'); const firstRound = completedStates[0].round; if (completedStates.some((state) => state.round.scope !== firstRound.scope || state.round.sourceSetId !== firstRound.sourceSetId || state.round.sessionId !== firstRound.sessionId)) return fail('game results require one scope, source set, and session'); if (completedStates.length !== firstRound.roundCount) return fail('game results must include every scheduled round'); const indices = completedStates.map((state) => state.round.roundIndex); if (new Set(indices).size !== firstRound.roundCount || indices.some((index) => index < 0 || index >= firstRound.roundCount)) return fail('game results must include each scheduled round index exactly once'); for (let index = 0; index < firstRound.roundCount; index += 1) if (!indices.includes(index)) return fail('game results must include every scheduled round'); if (new Set(completedStates.map((state) => state.round.roundId)).size !== completedStates.length || new Set(completedStates.map((state) => state.round.seed)).size !== completedStates.length) return fail('game results cannot include duplicate round identities or seeds'); const attempts = completedStates.flatMap((state) => state.attempts); return cloneAndFreeze({ rounds: completedStates.length, correctRounds: completedStates.length, attempts }) as GameResult }
