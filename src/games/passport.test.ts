import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPassport, awardChallenge, clearPendingPassport, hasPendingPassport, parsePassport, passportKey, readPendingPassport, readStoredPassport, rememberPendingPassport, writePassport } from './passport'

const challenge = { game: 'bubble' as const, bookId: 'four-upper', unit: 1, level: 1 }
const result = { completedRounds: 2, totalRounds: 2, firstTryCorrect: 1 }

beforeEach(() => clearPendingPassport())
afterEach(() => { vi.restoreAllMocks(); clearPendingPassport() })

describe('game passport', () => {
  it('awards only a completed non-empty challenge and preserves the best real result', () => {
    expect(awardChallenge([], challenge, { ...result, completedRounds: 0 }, 10)).toEqual([])
    expect(awardChallenge([], challenge, { ...result, completedRounds: 0, totalRounds: 0 }, 10)).toEqual([])
    const first = awardChallenge([], challenge, result, 10)
    expect(first).toHaveLength(1)
    expect(awardChallenge(first, challenge, result, 11)).toEqual(first)
    const improved = awardChallenge(first, challenge, { ...result, firstTryCorrect: 2 }, 12)
    expect(improved).toHaveLength(1)
    expect(improved[0]).toMatchObject({ firstTryCorrect: 2, completedAt: 12 })
    expect(awardChallenge(improved, { ...challenge, bookId: 'four-lower' }, result, 13)).toHaveLength(2)
  })
  it('does not invent achievements from missing, damaged or incompatible data', () => {
    expect(readPassport(null)).toEqual([])
    localStorage.setItem('word-planet:passport:v1', '{broken')
    expect(readPassport(localStorage)).toEqual([])
    expect(() => parsePassport({ version: 1, achievements: [{ ...challenge, ...result, completedAt: 2, firstTryCorrect: 9 }] })).toThrow()
    expect(() => parsePassport({ version: 2, achievements: [] })).toThrow()
  })
  it('keeps pending achievements separate from saved data and preserves their best result', () => {
    const first = awardChallenge([], challenge, result, 10)
    const better = awardChallenge([], challenge, { ...result, firstTryCorrect: 2 }, 11)
    rememberPendingPassport(first)
    rememberPendingPassport(better)
    rememberPendingPassport(first)
    expect(readPassport()).toEqual([])
    expect(readPendingPassport()).toEqual(better)
    expect(hasPendingPassport()).toBe(true)
    readPendingPassport()[0].firstTryCorrect = 0
    expect(readPendingPassport()).toEqual(better)
    clearPendingPassport()
    expect(hasPendingPassport()).toBe(false)
  })
  it('does not discard pending achievements on a failed write or failed empty clear', () => {
    const saved = awardChallenge([], challenge, result, 10)
    const pending = awardChallenge([], { ...challenge, level: 2 }, result, 11)
    writePassport(saved)
    rememberPendingPassport(pending)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(() => writePassport([...saved, ...pending])).toThrow('full')
    expect(() => writePassport([])).toThrow('full')
    expect(readPassport()).toEqual(saved)
    expect(readPendingPassport()).toEqual(pending)
  })
  it('refuses to replace an unreadable stored passport even with an empty clear', () => {
    localStorage.setItem(passportKey, '{broken')
    expect(() => readStoredPassport()).toThrow()
    expect(() => writePassport([])).toThrow()
    expect(localStorage.getItem(passportKey)).toBe('{broken')
  })
})
