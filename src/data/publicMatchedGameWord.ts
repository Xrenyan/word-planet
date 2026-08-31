import type { VocabularyWordContract } from '../../shared/contracts'
import type { Grade, Semester, WordAudioVariant, WordImage } from '../curriculum/types'

export interface PublicMatchedGameWord {
  scope: '公开来源匹配'
  disclaimer: '待手中教材页复核'
  id: string
  term: string
  meaningZh: string
  partOfSpeech: string
  ipaUk: string
  ipaUs: string
  grade: Grade
  semester: Semester
  unit: number
  listType: 'source-matched'
  image: WordImage
  audio: { uk: WordAudioVariant; us: WordAudioVariant }
  reviewStatus: 'source-matched'
}

export function toPublicMatchedGameWord(word: VocabularyWordContract, grade: Grade, semester: Semester): PublicMatchedGameWord {
  return {
    scope: '公开来源匹配', disclaimer: '待手中教材页复核', id: word.id, term: word.term,
    meaningZh: word.meaningZh, partOfSpeech: 'not-specified', ipaUk: word.ipaUk, ipaUs: word.ipaUs,
    grade, semester, unit: word.unit, listType: 'source-matched', image: { ...word.image, reviewed: true },
    audio: { uk: { source: 'system-voice', locale: 'en-GB' }, us: { source: 'system-voice', locale: 'en-US' } },
    reviewStatus: 'source-matched',
  }
}
