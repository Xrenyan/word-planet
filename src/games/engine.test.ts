import { describe, expect, it } from 'vitest'

import { demoWords } from '../test/fixtures/gameWords'
import {
  createGameRound,
  createGameRounds,
  createGameResult,
  createGameRoundState,
  recordGameAnswer,
  validateRoundCount,
} from './engine'

function verifiedFormalFixture() {
  return {
    id: 'formal-fixture', term: 'fixture', meaningZh: '示例', partOfSpeech: 'noun', ipaUk: '/ˈfɪkstʃə/', ipaUs: '/ˈfɪkstʃɚ/', grade: 3 as const, semester: 'upper' as const, unit: 1,
    listType: 'word-list', image: { src: '/word-art/fixture.png', alt: '原创示例图', license: 'original-generated', reviewed: true as const },
    audio: { uk: { source: 'system-voice', locale: 'en-GB' as const }, us: { source: 'system-voice', locale: 'en-US' as const } },
    evidence: { kind: 'textbook-page' as const, claim: 'word-appears-on-textbook-page' as const, isbn: '9787521354898', textbookPage: 1, localSourceId: 'test-owned-copy', rightsBasis: 'test-only-lawfully-owned-copy' as const },
    reviewStatus: 'verified' as const,
  }
}

describe('bubble game engine', () => {
  it('uses only the exact supplied word set and is deterministic', () => {
    const selectedWords = demoWords.slice(0, 4)
    const first = createGameRound(selectedWords, 42)
    const second = createGameRound(selectedWords, 42)

    expect(first).toEqual(second)
    expect(first.choices).toHaveLength(4)
    expect(first.choices.every((choice) => selectedWords.some((word) => word.id === choice.id))).toBe(true)
    expect(first.choices.map((choice) => choice.id)).toContain(first.target.id)
    expect(new Set(first.choices.map((choice) => choice.id)).size).toBe(first.choices.length)
  })

  it('creates a deeply immutable snapshot without mutating caller data', () => {
    const supplied = demoWords.slice(0, 4).map((word) => ({ ...word, image: { ...word.image } }))
    const before = structuredClone(supplied)
    const round = createGameRound(supplied, 7)

    expect(supplied).toEqual(before)
    expect(Object.isFrozen(round)).toBe(true)
    expect(Object.isFrozen(round.choices)).toBe(true)
    expect(Object.isFrozen(round.choices[0])).toBe(true)
    expect(Object.isFrozen(round.choices[0].image)).toBe(true)
    expect(() => { ;(round.choices as unknown as Array<unknown>).push({}) }).toThrow()
    expect(() => { ;(round.choices[0].image as { alt: string }).alt = 'changed' }).toThrow()
  })

  it('rejects empty, duplicate, mixed-scope, pending formal, malformed data, and invalid seeds', () => {
    const formal = verifiedFormalFixture()
    const pendingFormal = { ...formal, id: 'formal-pending', reviewStatus: 'pending' }

    expect(() => createGameRound([], 1)).toThrow(/at least one/i)
    expect(() => createGameRound([demoWords[0], demoWords[0]], 1)).toThrow(/unique/i)
    expect(() => createGameRound([demoWords[0], formal] as never, 1)).toThrow(/different game word scopes/i)
    expect(() => createGameRound([pendingFormal] as never, 1)).toThrow(/verified/i)
    expect(() => createGameRound([{ id: 'broken' }] as never, 1)).toThrow(/malformed/i)
    expect(() => createGameRound(demoWords, Number.NaN)).toThrow(/seed/i)
    expect(() => createGameRound(demoWords, 1.2)).toThrow(/seed/i)
  })

  it('records actual misses and correct answers, rejects unknown choices, and prevents double counting', () => {
    const round = createGameRound(demoWords.slice(0, 2), 11)
    const state = createGameRoundState(round)
    const wrongId = round.choices.find((choice) => choice.id !== round.target.id)!.id
    const afterMiss = recordGameAnswer(state, wrongId)
    const afterCorrect = recordGameAnswer(afterMiss, round.target.id)

    expect(afterMiss.status).toBe('answering')
    expect(afterMiss.attempts).toEqual([{ wordId: wrongId, outcome: 'missed' }])
    expect(afterCorrect.status).toBe('complete')
    expect(afterCorrect.attempts.at(-1)).toEqual({ wordId: round.target.id, outcome: 'correct' })
    expect(() => recordGameAnswer(state, 'not-a-choice')).toThrow(/choice/i)
    expect(recordGameAnswer(afterCorrect, wrongId)).toEqual(afterCorrect)
  })

  it('creates a finite validated round series without immediate target repetition when possible', () => {
    expect(validateRoundCount(1)).toBe(1)
    expect(validateRoundCount(20)).toBe(20)
    expect(() => validateRoundCount(0)).toThrow(/1.*20/i)
    expect(() => validateRoundCount(1.5)).toThrow(/integer/i)
    const rounds = createGameRounds(demoWords.slice(0, 4), 9, 12)

    expect(rounds).toHaveLength(12)
    expect(rounds.every((round, index) => index === 0 || round.target.id !== rounds[index - 1].target.id)).toBe(true)
  })

  it('rejects a self-asserted formal word unless it satisfies the complete strict curriculum schema', () => {
    const forged = {
      id: 'forged-formal',
      term: 'fabricated',
      meaningZh: '伪造',
      reviewStatus: 'verified',
      image: { src: '/word-art/forged.png', alt: 'forged', license: 'forged', reviewed: true },
    }
    const withUnknownField = { ...demoWords[0], unexpected: true }

    expect(() => createGameRound([forged] as never, 1)).toThrow(/malformed|verified/i)
    expect(() => createGameRound([withUnknownField] as never, 1)).toThrow(/malformed/i)
  })

  it('rejects formal and demo fields that fall outside their strict runtime schemas', () => {
    const formal = verifiedFormalFixture()
    const missingEvidence = { ...formal, evidence: undefined }
    const malformedAudio = { ...formal, audio: { uk: formal.audio.uk } }
    const blankIpa = { ...formal, ipaUk: '' }
    const invalidGrade = { ...formal, grade: 7 }
    const malformedDemo = { ...demoWords[0], audio: { ...demoWords[0].audio, uk: { source: 'system-voice', locale: 'en-US' } } }

    expect(createGameRound([formal], 2).scope).toBe('formal')
    expect(() => createGameRound([missingEvidence] as never, 2)).toThrow(/malformed/i)
    expect(() => createGameRound([malformedAudio] as never, 2)).toThrow(/malformed/i)
    expect(() => createGameRound([blankIpa] as never, 2)).toThrow(/malformed/i)
    expect(() => createGameRound([invalidGrade] as never, 2)).toThrow(/malformed/i)
    expect(() => createGameRound([malformedDemo] as never, 2)).toThrow(/malformed/i)
  })

  it('rejects inconsistent caller-owned rounds and never freezes them', () => {
    const inconsistent = {
      seed: 4,
      scope: 'demo',
      target: { id: 'demo-target', term: 'target', meaningZh: '目标', image: demoWords[0].image },
      choices: [{ id: 'demo-choice', term: 'choice', meaningZh: '选项', image: demoWords[0].image }],
    }

    expect(Object.isFrozen(inconsistent)).toBe(false)
    expect(() => createGameRoundState(inconsistent as never)).toThrow(/target|round/i)
    expect(Object.isFrozen(inconsistent)).toBe(false)
  })

  it('rejects forged, incomplete, and incoherent state boundaries before recording or summarising', () => {
    const round = createGameRound(demoWords.slice(0, 2), 3)
    const forgedAttemptState = {
      round,
      status: 'answering',
      attempts: [{ wordId: round.target.id, outcome: 'correct' }],
    }
    const duplicateTerminalState = {
      round,
      status: 'complete',
      attempts: [
        { wordId: round.target.id, outcome: 'correct' },
        { wordId: round.target.id, outcome: 'correct' },
      ],
    }
    const unknownAttemptState = {
      round,
      status: 'answering',
      attempts: [{ wordId: 'not-in-round', outcome: 'missed' }],
    }
    const invalidStatusState = { round, status: 'broken', attempts: [] }

    expect(() => recordGameAnswer(forgedAttemptState as never, round.target.id)).toThrow(/state|attempt/i)
    expect(() => createGameResult([forgedAttemptState] as never)).toThrow(/complete|attempt/i)
    expect(() => createGameResult([duplicateTerminalState] as never)).toThrow(/complete|attempt/i)
    expect(() => recordGameAnswer(unknownAttemptState as never, round.target.id)).toThrow(/state|attempt/i)
    expect(() => recordGameAnswer(invalidStatusState as never, round.target.id)).toThrow(/state|attempt/i)
    expect(() => createGameResult([])).toThrow(/completed/i)
  })

  it('aggregates only unique completed rounds from one verified source-set session', () => {
    const complete = (round: ReturnType<typeof createGameRound>) => recordGameAnswer(createGameRoundState(round), round.target.id)
    const demoSession = createGameRounds(demoWords.slice(0, 2), 31, 2)
    const formalSession = createGameRound([verifiedFormalFixture()], 32)
    const otherDemoSet = createGameRound(demoWords.slice(2, 4), 31)
    const completed = demoSession.map(complete)

    expect(createGameResult(completed)).toMatchObject({ rounds: 2, correctRounds: 2 })
    expect(() => createGameResult([completed[0], complete(formalSession)])).toThrow(/scope|source|session/i)
    expect(() => createGameResult([completed[0], complete(otherDemoSet)])).toThrow(/source|session/i)
    expect(() => createGameResult([completed[0], completed[0]])).toThrow(/duplicate|round|seed/i)
  })

  it('uses one canonical, complete deterministic schedule for a source set', () => {
    const complete = (round: ReturnType<typeof createGameRound>) => recordGameAnswer(createGameRoundState(round), round.target.id)
    const forward = createGameRounds(demoWords, 41, 4)
    const reversed = createGameRounds([...demoWords].reverse(), 41, 4)
    const single = createGameRound(demoWords, 41)
    const seriesSingle = createGameRounds(demoWords, 41, 1)[0]

    expect(reversed).toEqual(forward)
    expect(seriesSingle).toEqual(single)
    expect(createGameResult([complete(single)])).toMatchObject({ rounds: 1, correctRounds: 1 })
    expect(() => createGameResult([complete(forward[0]), complete(forward[2])])).toThrow(/round|session|complete/i)
    expect(() => createGameResult([complete(forward[0]), complete(forward[1]), complete(forward[2]), complete(forward[3]), complete(forward[0])])).toThrow(/round|session|complete/i)
    const repeatedIndex = { ...structuredClone(forward[1]), roundIndex: 0, seed: forward[0].seed, roundId: forward[0].roundId }
    expect(() => createGameResult([complete(forward[0]), complete(repeatedIndex), complete(forward[2]), complete(forward[3])])).toThrow(/round|session|complete/i)
  })

  it('rejects round seeds and result indices that do not exactly cover the declared schedule', () => {
    const complete = (round: ReturnType<typeof createGameRound>) => recordGameAnswer(createGameRoundState(round), round.target.id)
    const rounds = createGameRounds(demoWords.slice(0, 2), 53, 2)
    const forgedSeed = rounds[0].seed + 1
    const forgedRound = { ...structuredClone(rounds[0]), seed: forgedSeed, roundId: JSON.stringify({ sessionId: rounds[0].sessionId, roundIndex: rounds[0].roundIndex, seed: forgedSeed }) }

    expect(() => createGameRoundState(forgedRound)).toThrow(/seed|round/i)
    expect(createGameResult(rounds.map(complete))).toMatchObject({ rounds: 2, correctRounds: 2 })
    const twentyRounds = createGameRounds(demoWords.slice(0, 2), 59, 20)
    expect(createGameResult(twentyRounds.map(complete))).toMatchObject({ rounds: 20, correctRounds: 20 })
  })

  it('binds every round identity to its exact deterministic choices and target', () => {
    const round = createGameRound(demoWords, 73)
    const alternate = round.choices.find((choice) => choice.id !== round.target.id)!
    const alternateTarget = { ...structuredClone(round), target: structuredClone(alternate) }
    const reorderedChoices = { ...structuredClone(round), choices: [...round.choices].reverse() }
    const fiveWords = [...demoWords, { ...demoWords[0], id: 'demo-moon', term: 'moon', meaningZh: '月亮（功能演示）' }]
    const fiveWordRound = createGameRound(fiveWords, 73)
    const omitted = fiveWords.find((word) => !fiveWordRound.choices.some((choice) => choice.id === word.id))!
    const replacementIndex = fiveWordRound.choices.findIndex((choice) => choice.id !== fiveWordRound.target.id)
    const substitutedChoices = fiveWordRound.choices.map((choice, index) => index === replacementIndex ? { id: omitted.id, term: omitted.term, meaningZh: omitted.meaningZh, image: omitted.image } : choice)
    const substitutedChoice = { ...structuredClone(fiveWordRound), choices: substitutedChoices }
    const session = createGameRounds(demoWords, 73, 2)
    const forgedComplete = { round: alternateTarget, status: 'complete' as const, attempts: [{ wordId: alternate.id, outcome: 'correct' as const }] }
    const completeSecond = recordGameAnswer(createGameRoundState(session[1]), session[1].target.id)

    expect(() => createGameRoundState(alternateTarget)).toThrow(/round|choice|target/i)
    expect(() => createGameRoundState(reorderedChoices)).toThrow(/round|choice|target/i)
    expect(() => createGameRoundState(substitutedChoice)).toThrow(/round|choice|target/i)
    expect(() => createGameResult([forgedComplete, completeSecond])).toThrow(/state|round|choice|target/i)
    expect(session[1].target.id).not.toBe(session[0].target.id)
  })
})
