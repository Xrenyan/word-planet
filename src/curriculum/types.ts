import type { z } from 'zod'

import type {
  AudioVariantSchema,
  BookBibliographicEvidenceSchema,
  CurriculumBookSchema,
  DeepReadonly,
  ImageSchema,
  SeriesEvidenceSchema,
  SeriesSchema,
  VerifiedCatalogSchema,
  VocabularyWordSchema,
  WordEvidenceSchema,
} from './schema'

export type VocabularyWord = DeepReadonly<
  z.output<typeof VocabularyWordSchema>
>
export type CurriculumBook = DeepReadonly<
  z.output<typeof CurriculumBookSchema>
>
export type VerifiedCatalog = DeepReadonly<
  z.output<typeof VerifiedCatalogSchema>
>
export type CurriculumSeries = DeepReadonly<z.output<typeof SeriesSchema>>
export type SeriesEvidence = DeepReadonly<
  z.output<typeof SeriesEvidenceSchema>
>
export type BookBibliographicEvidence = DeepReadonly<
  z.output<typeof BookBibliographicEvidenceSchema>
>
export type WordEvidence = DeepReadonly<z.output<typeof WordEvidenceSchema>>
export type WordImage = DeepReadonly<z.output<typeof ImageSchema>>
export type WordAudioVariant = DeepReadonly<
  z.output<typeof AudioVariantSchema>
>
export type Grade = VocabularyWord['grade']
export type Semester = VocabularyWord['semester']
