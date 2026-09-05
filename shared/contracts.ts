import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  storage: z.literal('ready'),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const SemesterSchema = z.enum(['upper', 'lower'])
export const VerificationStatusSchema = z.enum(['verified', 'draft', 'rejected'])

export const BookSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  grade: z.number().int().min(3).max(6),
  semester: SemesterSchema,
  status: z.enum(['verified', 'source-matched', 'awaiting-source']),
  verifiedWordCount: z.number().int().nonnegative(),
  availableWordCount: z.number().int().nonnegative().optional(),
  editionLabel: z.string().optional(),
  editionNote: z.string().optional(),
})

export const VocabularyWordContractSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().min(1),
  unit: z.number().int().positive(),
  unitLabel: z.string().optional(),
  order: z.number().int().positive(),
  term: z.string().min(1),
  meaningZh: z.string().min(1),
  ipaUk: z.string().min(1),
  ipaUs: z.string().min(1),
  ipaStatus: z.enum(['official', 'public-source', 'dictionary-api', 'unavailable']).optional(),
  ipaNote: z.string().optional(),
  ipaCommon: z.string().optional(),
  ipaSource: z.string().optional(),
  image: z.object({
    src: z.string().min(1),
    alt: z.string().min(1),
    license: z.string().min(1),
  }),
  source: z.object({
    title: z.string().min(1),
    url: z.string().min(1),
    page: z.number().int().positive(),
  }),
  sourceConfidence: z.enum(['official', 'public-secondary', 'user-photo']).optional(),
  editionNote: z.string().optional(),
})

export const BooksResponseSchema = z.object({
  books: z.array(BookSummarySchema),
})

export const WordsResponseSchema = z.object({
  bookId: z.string().min(1),
  words: z.array(VocabularyWordContractSchema),
})

export type BookSummary = z.infer<typeof BookSummarySchema>
export type VocabularyWordContract = z.infer<typeof VocabularyWordContractSchema>
export type BooksResponse = z.infer<typeof BooksResponseSchema>
export type WordsResponse = z.infer<typeof WordsResponseSchema>

export const LearningEventSchema = z.object({
  id: z.string().min(1).max(160),
  profileId: z.string().min(1).max(80),
  wordId: z.string().min(1).max(160),
  outcome: z.enum(['correct', 'missed']),
  source: z.enum(['recognition', 'pronunciation', 'spelling', 'game']),
  occurredAt: z.number().int().nonnegative(),
}).strict()

export type LearningEvent = z.infer<typeof LearningEventSchema>

export const ServerProgressSchema = z.object({
  profileId: z.string().min(1),
  totalEvents: z.number().int().nonnegative(),
  priorityWordIds: z.array(z.string()),
  events: z.array(LearningEventSchema),
})

export type ServerProgress = z.infer<typeof ServerProgressSchema>

export const ReviewItemSchema = z.object({
  word: VocabularyWordContractSchema,
  misses: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  weakness: z.number().int().nonnegative(),
  dueAt: z.number().int().nonnegative().optional(),
  lastAttemptAt: z.number().int().nonnegative(),
})

export const ReviewResponseSchema = z.object({
  profileId: z.string().min(1),
  items: z.array(ReviewItemSchema),
})

export type ReviewItem = z.infer<typeof ReviewItemSchema>
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>

export const WorksheetSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.object({
    bookId: z.string(),
    unit: z.number().int().positive(),
    verifiedOnly: z.literal(true).optional(),
    contentStatus: z.enum(['verified', 'source-matched']).optional(),
  }),
  questions: z.array(z.object({
    number: z.number().int().positive(), wordId: z.string(), prompt: z.string(), blank: z.string(),
    image: z.object({ src: z.string(), alt: z.string(), license: z.string() }),
  })),
  answers: z.array(z.object({ number: z.number().int().positive(), wordId: z.string(), answer: z.string() })),
})

export type Worksheet = z.infer<typeof WorksheetSchema>
