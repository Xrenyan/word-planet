import { z } from 'zod'

export const MOE_CATALOG_URL =
  'https://www.moe.gov.cn/srcsite/A26/s8001/202408/W020250418502592948423.pdf'
export const FLTRP_PRICE_FILING_URL =
  'https://www.fltrp.com/upload/resources/file/2024/07/18/91583.pdf'
export const TARGET_SERIES_NAME = '义务教育教科书·英语（配有听力材料）'

const CANONICAL_BOOK_SLOTS = [
  { grade: 3, semester: 'upper', label: '三年级上册' },
  { grade: 3, semester: 'lower', label: '三年级下册' },
  { grade: 4, semester: 'upper', label: '四年级上册' },
  { grade: 4, semester: 'lower', label: '四年级下册' },
  { grade: 5, semester: 'upper', label: '五年级上册' },
  { grade: 5, semester: 'lower', label: '五年级下册' },
  { grade: 6, semester: 'upper', label: '六年级上册' },
  { grade: 6, semester: 'lower', label: '六年级下册' },
] as const

const POSITIVELY_VERIFIED_BOOKS = new Map([
  [
    '3-upper',
    {
      isbn: '9787521354898',
      title: '英语（新标准）（三年级起点）三年级上册（新版）',
    },
  ],
])

const LEGACY_2011_ISBNS = new Set([
  '9787513533096',
  '9787513545976',
  '9787513545983',
])
const VERIFIED_OFFICIAL_VOCABULARY_SOURCES = new Set<string>()

function normalizeIsbn(isbn: string) {
  return isbn.replaceAll('-', '')
}

function hasValidIsbn13CheckDigit(isbn: string) {
  const digits = [...isbn].map(Number)
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === digits[12]
}

function slotKey(grade: number, semester: string) {
  return `${grade}-${semester}`
}

function canonicalBookId(grade: number, semester: string) {
  return `fltrp-nse-2022-g${grade}-${semester}`
}

function isOfficialSourceUrl(sourceUrl: string) {
  const hostname = new URL(sourceUrl).hostname
  return (
    hostname === 'moe.gov.cn' ||
    hostname.endsWith('.moe.gov.cn') ||
    hostname === 'fltrp.com' ||
    hostname.endsWith('.fltrp.com')
  )
}

const IsbnSchema = z
  .string()
  .refine(
    (isbn) => {
      const normalized = normalizeIsbn(isbn)
      const hasCanonicalFormat =
        /^\d{13}$/.test(isbn) || /^\d{3}-\d-\d{4}-\d{4}-\d$/.test(isbn)
      return (
        hasCanonicalFormat &&
        /^\d{13}$/.test(normalized) &&
        hasValidIsbn13CheckDigit(normalized)
      )
    },
    { message: 'valid ISBN-13 required' },
  )
  .superRefine((isbn, context) => {
    if (LEGACY_2011_ISBNS.has(normalizeIsbn(isbn))) {
      context.addIssue({
        code: 'custom',
        message: 'legacy 2011-edition ISBN is forbidden in the latest catalog',
      })
    }
  })
  .transform(normalizeIsbn)

export const SeriesEvidenceSchema = z
  .object({
    claim: z.literal('series-editor-curriculum-range'),
    sourceUrl: z.literal(MOE_CATALOG_URL),
    sourcePage: z.literal(5),
    rightsBasis: z.literal('official-public-catalog'),
  })
  .strict()

const TitleIsbnClaimSchema = z
  .object({
    claim: z.literal('book-title-isbn'),
    sourceUrl: z.literal(FLTRP_PRICE_FILING_URL),
    sourcePage: z.literal(1),
    rightsBasis: z.literal('official-public-price-filing'),
  })
  .strict()

export const BookBibliographicEvidenceSchema = z
  .object({
    isbn: IsbnSchema,
    title: z.string().min(1),
    seriesEditionClaim: SeriesEvidenceSchema,
    titleIsbnClaim: TitleIsbnClaimSchema,
  })
  .strict()

const TextbookPageWordEvidenceSchema = z
  .object({
    kind: z.literal('textbook-page'),
    claim: z.literal('word-appears-on-textbook-page'),
    isbn: IsbnSchema,
    textbookPage: z.number().int().positive(),
    localSourceId: z.string().min(1),
    rightsBasis: z.enum([
      'user-provided-lawfully-owned-copy',
      'licensed-textbook-copy',
      'test-only-lawfully-owned-copy',
    ]),
  })
  .strict()

const OfficialWordListEvidenceSchema = z
  .object({
    kind: z.literal('official-word-list'),
    claim: z.literal('word-appears-in-official-word-list'),
    isbn: IsbnSchema,
    sourceUrl: z.url(),
    sourcePage: z.number().int().positive().optional(),
    rightsBasis: z.literal('official-public-vocabulary-resource'),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (!isOfficialSourceUrl(evidence.sourceUrl)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'official source URL required',
      })
    }

    if (!VERIFIED_OFFICIAL_VOCABULARY_SOURCES.has(evidence.sourceUrl)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'official vocabulary source is not verified',
      })
    }
  })

export const WordEvidenceSchema = z.union(
  [TextbookPageWordEvidenceSchema, OfficialWordListEvidenceSchema],
  {
    error:
      'word evidence must identify an actual vocabulary-bearing source',
  },
)

export const ImageSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string().min(1),
    license: z.string().min(1),
    reviewed: z.literal(true),
  })
  .strict()

export const AudioVariantSchema = z
  .object({
    source: z.string().min(1),
    locale: z.enum(['en-GB', 'en-US']),
    src: z.string().min(1).optional(),
  })
  .strict()

export const VocabularyWordSchema = z
  .object({
    id: z.string().min(1),
    term: z.string().min(1),
    meaningZh: z.string().min(1),
    partOfSpeech: z.string().min(1),
    ipaUk: z.string().min(1),
    ipaUs: z.string().min(1),
    grade: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    semester: z.enum(['upper', 'lower']),
    unit: z.number().int().positive(),
    listType: z.string().min(1),
    image: ImageSchema,
    audio: z.object({ uk: AudioVariantSchema, us: AudioVariantSchema }).strict(),
    evidence: WordEvidenceSchema,
    reviewStatus: z.enum(['verified', 'pending']),
  })
  .strict()

export const SeriesSchema = z
  .object({
    name: z.literal(TARGET_SERIES_NAME, {
      error: 'canonical latest series name required',
    }),
    publisher: z.literal('外语教学与研究出版社'),
    editor: z.literal('孙有中'),
    curriculumStandard: z.literal('2022'),
    evidence: SeriesEvidenceSchema,
  })
  .strict()

export const CurriculumBookSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    grade: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    semester: z.enum(['upper', 'lower']),
    status: z.enum(['verified', 'awaiting-source']),
    evidence: BookBibliographicEvidenceSchema.optional(),
    words: z.array(VocabularyWordSchema),
  })
  .strict()
  .superRefine((book, context) => {
    const canonicalSlot = CANONICAL_BOOK_SLOTS.find(
      (slot) => slot.grade === book.grade && slot.semester === book.semester,
    )!
    if (
      book.id !== canonicalBookId(book.grade, book.semester) ||
      book.label !== canonicalSlot.label
    ) {
      context.addIssue({
        code: 'custom',
        message: 'book id and label must match its canonical slot',
      })
    }

    if (book.status === 'awaiting-source' && book.words.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['words'],
        message: 'awaiting-source books must have no words',
      })
    }

    if (book.status === 'verified' && !book.evidence) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'verified books require bibliographic evidence',
      })
    }

    const verifiedBook = POSITIVELY_VERIFIED_BOOKS.get(
      slotKey(book.grade, book.semester),
    )
    if (
      book.status === 'verified' &&
      (!verifiedBook ||
        !book.evidence ||
        book.evidence.isbn !== verifiedBook.isbn ||
        book.evidence.title !== verifiedBook.title)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'ISBN is not positively verified for this book slot',
      })
    }

    if (
      book.evidence &&
      (!verifiedBook ||
        book.evidence.isbn !== verifiedBook.isbn ||
        book.evidence.title !== verifiedBook.title)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'ISBN is not positively verified for this book slot',
      })
    }

    if (
      book.status === 'verified' &&
      book.words.some((word) => word.reviewStatus !== 'verified')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['words'],
        message: 'verified books may expose only verified words',
      })
    }

    if (
      book.words.some(
        (word) =>
          word.grade !== book.grade || word.semester !== book.semester,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['words'],
        message: 'word book identity must match its container',
      })
    }

    if (
      book.evidence &&
      book.words.some(
        (word) =>
          normalizeIsbn(word.evidence.isbn) !==
          normalizeIsbn(book.evidence!.isbn),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['words'],
        message: 'word ISBN must match its verified book',
      })
    }
  })

export const VerifiedCatalogSchema = z
  .object({
    series: SeriesSchema,
    books: z.array(CurriculumBookSchema),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.books.length !== CANONICAL_BOOK_SLOTS.length) {
      context.addIssue({
        code: 'custom',
        path: ['books'],
        message: 'catalog must contain exactly eight canonical book slots',
      })
    }

    const counts = new Map<string, number>()
    for (const book of catalog.books) {
      const key = slotKey(book.grade, book.semester)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    if (
      CANONICAL_BOOK_SLOTS.some(
        (slot) => counts.get(slotKey(slot.grade, slot.semester)) !== 1,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['books'],
        message: 'each grade-semester slot must appear exactly once',
      })
    }
  })

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

export function parseVerifiedCatalog(
  input: unknown,
): DeepReadonly<z.output<typeof VerifiedCatalogSchema>> {
  return deepFreeze(VerifiedCatalogSchema.parse(input))
}
