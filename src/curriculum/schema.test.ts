import { describe, expect, it } from 'vitest'

import { parseVerifiedCatalog } from './schema'

const officialSeries = {
  name: '义务教育教科书·英语（配有听力材料）',
  publisher: '外语教学与研究出版社',
  editor: '孙有中',
  curriculumStandard: '2022',
  evidence: {
    claim: 'series-editor-curriculum-range',
    sourceUrl:
      'https://www.moe.gov.cn/srcsite/A26/s8001/202408/W020250418502592948423.pdf',
    sourcePage: 5,
    rightsBasis: 'official-public-catalog',
  },
} as const

function makeFormalWord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'formal-cat',
    term: 'cat',
    meaningZh: '猫',
    partOfSpeech: 'noun',
    ipaUk: '/kæt/',
    ipaUs: '/kæt/',
    grade: 3,
    semester: 'upper',
    unit: 1,
    listType: 'word-list',
    image: {
      src: '/word-art/formal-cat.webp',
      alt: '一只猫',
      license: 'original-generated',
      reviewed: true,
    },
    audio: {
      uk: { source: 'system-voice', locale: 'en-GB' },
      us: { source: 'system-voice', locale: 'en-US' },
    },
    evidence: {
      kind: 'textbook-page',
      claim: 'word-appears-on-textbook-page',
      isbn: '978-7-5213-5489-8',
      textbookPage: 88,
      localSourceId: 'test-only:g3-upper:page-88',
      rightsBasis: 'test-only-lawfully-owned-copy',
    },
    reviewStatus: 'verified',
    ...overrides,
  }
}

function makeCatalog(bookOverrides: Record<string, unknown> = {}) {
  const catalog = makeClaimScopedCatalog()
  Object.assign(catalog.books[0], bookOverrides)
  return catalog
}

const canonicalBookSlots = [
  [3, 'upper', '三年级上册'],
  [3, 'lower', '三年级下册'],
  [4, 'upper', '四年级上册'],
  [4, 'lower', '四年级下册'],
  [5, 'upper', '五年级上册'],
  [5, 'lower', '五年级下册'],
  [6, 'upper', '六年级上册'],
  [6, 'lower', '六年级下册'],
] as const

function makeClaimScopedCatalog() {
  return {
    series: {
      name: '义务教育教科书·英语（配有听力材料）',
      publisher: '外语教学与研究出版社',
      editor: '孙有中',
      curriculumStandard: '2022',
      evidence: {
        claim: 'series-editor-curriculum-range',
        sourceUrl:
          'https://www.moe.gov.cn/srcsite/A26/s8001/202408/W020250418502592948423.pdf',
        sourcePage: 5,
        rightsBasis: 'official-public-catalog',
      },
    },
    books: canonicalBookSlots.map(([grade, semester, label]) => {
      const base = {
        id: `fltrp-nse-2022-g${grade}-${semester}`,
        label,
        grade,
        semester,
        status: 'awaiting-source',
        words: [],
      }

      if (grade !== 3 || semester !== 'upper') return base

      return {
        ...base,
        status: 'verified',
        evidence: {
          isbn: '978-7-5213-5489-8',
          title: '英语（新标准）（三年级起点）三年级上册（新版）',
          seriesEditionClaim: {
            claim: 'series-editor-curriculum-range',
            sourceUrl:
              'https://www.moe.gov.cn/srcsite/A26/s8001/202408/W020250418502592948423.pdf',
            sourcePage: 5,
            rightsBasis: 'official-public-catalog',
          },
          titleIsbnClaim: {
            claim: 'book-title-isbn',
            sourceUrl:
              'https://www.fltrp.com/upload/resources/file/2024/07/18/91583.pdf',
            sourcePage: 1,
            rightsBasis: 'official-public-price-filing',
          },
        },
        words: [
          {
            ...makeFormalWord(),
            term: 'test-only-fixture-word',
            meaningZh: '测试专用词',
            evidence: {
              kind: 'textbook-page',
              claim: 'word-appears-on-textbook-page',
              isbn: '978-7-5213-5489-8',
              textbookPage: 88,
              localSourceId: 'test-only:g3-upper:page-88',
              rightsBasis: 'test-only-lawfully-owned-copy',
            },
          },
        ],
      }
    }),
  }
}

describe('parseVerifiedCatalog', () => {
  it('rejects a formal word without page or official URL evidence', async () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [
            makeFormalWord({
              evidence: {
                kind: 'textbook-page',
                claim: 'word-appears-on-textbook-page',
                isbn: '978-7-5213-5489-8',
                localSourceId: 'test-only:g3-upper:missing-page',
                rightsBasis: 'test-only-lawfully-owned-copy',
              },
            }),
          ],
        }),
      ),
    ).toThrow(/word evidence must identify|textbookPage/)
  })

  it('accepts an awaiting-source book only when its formal word list is empty', () => {
    const parsed = parseVerifiedCatalog(
      makeCatalog({ status: 'awaiting-source', words: [] }),
    )

    expect(parsed.books[0].status).toBe('awaiting-source')
    expect(parsed.books[0].words).toEqual([])
  })

  it('rejects an awaiting-source book that exposes a formal word', () => {
    expect(() =>
      parseVerifiedCatalog(makeCatalog({ status: 'awaiting-source' })),
    ).toThrow(/awaiting-source books must have no words/)
  })

  it('rejects a non-verified word exposed by a verified formal book', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [makeFormalWord({ reviewStatus: 'pending' })],
        }),
      ),
    ).toThrow(/verified books may expose only verified words/)
  })

  it('rejects a known 2011-edition ISBN disguised as current data', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [
            makeFormalWord({
              evidence: {
                kind: 'textbook-page',
                claim: 'word-appears-on-textbook-page',
                isbn: '978-7-5135-4598-3',
                textbookPage: 88,
                localSourceId: 'test-only:legacy:page-88',
                rightsBasis: 'test-only-lawfully-owned-copy',
              },
            }),
          ],
        }),
      ),
    ).toThrow(/legacy 2011-edition ISBN/)
  })

  it('rejects a non-official URL presented as formal evidence', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [
            makeFormalWord({
              evidence: {
                kind: 'official-word-list',
                claim: 'word-appears-in-official-word-list',
                isbn: '978-7-5213-5489-8',
                sourceUrl: 'https://example.com/unverified-word-list',
                rightsBasis: 'official-public-vocabulary-resource',
              },
            }),
          ],
        }),
      ),
    ).toThrow(/official source URL required/)
  })

  it('rejects a verified book without verified bibliographic evidence', () => {
    expect(() =>
      parseVerifiedCatalog(makeCatalog({ evidence: undefined })),
    ).toThrow(/verified books require bibliographic evidence/)
  })

  it('rejects a word whose book identity differs from its container', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [makeFormalWord({ grade: 4 })],
        }),
      ),
    ).toThrow(/word book identity must match its container/)
  })

  it('rejects the price filing as evidence that a word appears in a textbook', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [
            makeFormalWord({
              evidence: {
                isbn: '978-7-5213-5489-8',
                editor: '孙有中',
                curriculumStandard: '2022',
                sourceUrl:
                  'https://www.fltrp.com/upload/resources/file/2024/07/18/91583.pdf',
                sourcePage: 1,
              },
            }),
          ],
        }),
      ),
    ).toThrow(
      /word evidence must identify an actual vocabulary-bearing source/,
    )
  })

  it('rejects a bare page number with no identifiable source', () => {
    expect(() =>
      parseVerifiedCatalog(
        makeCatalog({
          words: [
            makeFormalWord({
              evidence: {
                isbn: '978-7-5213-5489-8',
                editor: '孙有中',
                curriculumStandard: '2022',
                sourcePage: 1,
              },
            }),
          ],
        }),
      ),
    ).toThrow(/word evidence must identify an actual vocabulary-bearing source/)
  })

  it('accepts claim-scoped book evidence and test-only local textbook evidence', () => {
    expect(() => parseVerifiedCatalog(makeClaimScopedCatalog())).not.toThrow()
  })

  it('rejects a catalog with a missing grade-semester slot', () => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    catalog.books.pop()

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /catalog must contain exactly eight canonical book slots/,
    )
  })

  it('rejects a duplicated grade-semester slot', () => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    catalog.books[7] = structuredClone(catalog.books[0])

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /each grade-semester slot must appear exactly once/,
    )
  })

  it.each([
    ['id', 'fltrp-wrong-id'],
    ['label', '错误册次'],
  ])('rejects a non-canonical book %s', (field, value) => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    Object.assign(catalog.books[0], { [field]: value })

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /book id and label must match its canonical slot/,
    )
  })

  it('rejects a non-canonical series name', () => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    catalog.series.name = '相似但未经核实的系列名'

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /canonical latest series name required/,
    )
  })

  it('rejects an ISBN-13 with an invalid check digit', () => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    const book = catalog.books[0]
    if (!('evidence' in book) || !book.evidence) throw new Error('fixture')
    book.evidence.isbn = '978-7-5213-5489-7'
    book.words[0].evidence.isbn = '978-7-5213-5489-7'

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /valid ISBN-13 required/,
    )
  })

  it('rejects the verified grade-3 upper ISBN when bound to grade-4 upper', () => {
    const catalog = structuredClone(makeClaimScopedCatalog())
    const grade3Upper = catalog.books[0]
    const grade4Upper = catalog.books[2]
    if (!('evidence' in grade3Upper) || !grade3Upper.evidence) {
      throw new Error('fixture')
    }

    Object.assign(grade4Upper, {
      status: 'verified',
      evidence: structuredClone(grade3Upper.evidence),
      words: structuredClone(grade3Upper.words).map((word) => ({
        ...word,
        grade: 4,
      })),
    })
    Object.assign(grade3Upper, {
      status: 'awaiting-source',
      evidence: undefined,
      words: [],
    })

    expect(() => parseVerifiedCatalog(catalog)).toThrow(
      /ISBN is not positively verified for this book slot/,
    )
  })
})
