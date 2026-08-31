import { WorksheetSchema, type Worksheet } from '../../shared/contracts'
import type { WordPlanetApi } from '../app/api/client'

export type WorksheetRequest = {
  bookId: string
  unit: number
  count: number
  seed: string
  priorityWordIds?: readonly string[]
}

function seedNumber(seed: string) {
  let value = 2166136261
  for (const character of seed) value = Math.imul(value ^ character.codePointAt(0)!, 16777619)
  return value >>> 0
}

function shuffle<T>(values: readonly T[], seed: string) {
  const result = [...values]
  let state = seedNumber(seed)
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const selected = state % (index + 1)
    ;[result[index], result[selected]] = [result[selected], result[index]]
  }
  return result
}

export async function generateWorksheet(api: WordPlanetApi, request: WorksheetRequest): Promise<Worksheet> {
  if (!Number.isInteger(request.unit) || request.unit < 1 || !Number.isInteger(request.count) || request.count < 1) throw new Error('invalid-worksheet-request')
  const response = await api.getWords(request.bookId, request.unit)
  if (request.count > response.words.length) throw new Error('worksheet-count-exceeds-unit')
  const priorities = new Set(request.priorityWordIds ?? [])
  const ordered = shuffle(response.words, request.seed).sort((left, right) => Number(priorities.has(right.id)) - Number(priorities.has(left.id)))
  const selected = ordered.slice(0, request.count)
  return WorksheetSchema.parse({
    id: `local-${request.bookId}-u${request.unit}-${seedNumber(request.seed).toString(36)}`,
    title: `Unit ${request.unit} 单词默写`,
    source: { bookId: request.bookId, unit: request.unit, contentStatus: 'source-matched' },
    questions: selected.map((word, index) => ({
      number: index + 1,
      wordId: word.id,
      prompt: word.meaningZh,
      blank: '_'.repeat(Math.max(8, Math.min(18, word.term.length + 4))),
      image: word.image,
    })),
    answers: selected.map((word, index) => ({ number: index + 1, wordId: word.id, answer: word.term })),
  })
}
