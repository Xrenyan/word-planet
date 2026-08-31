import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'content/manifest.json'), 'utf8'))
const sourced = JSON.parse(await readFile(resolve(root, 'content/sourced-vocabulary.json'), 'utf8'))
const outputRoot = resolve(root, 'public/data')
const booksRoot = resolve(outputRoot, 'books')

if (!Array.isArray(manifest.books) || manifest.books.length !== 8) throw new Error('Expected exactly eight curriculum books')
if (!Array.isArray(sourced.books) || sourced.books.length !== 8) throw new Error('Expected exactly eight sourced vocabulary books')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(booksRoot, { recursive: true })

const sourcedById = new Map(sourced.books.map((book) => [book.id, book]))
const catalog = []
let total = 0

for (const descriptor of manifest.books) {
  const book = sourcedById.get(descriptor.id)
  if (!book) throw new Error(`Missing sourced vocabulary for ${descriptor.id}`)
  if (!['verified', 'source-matched'].includes(book.status)) throw new Error(`Unsafe curriculum status for ${descriptor.id}`)
  if (!Array.isArray(book.words) || book.words.length === 0) throw new Error(`No words for ${descriptor.id}`)

  const ids = new Set()
  for (const word of book.words) {
    if (word.bookId !== descriptor.id || !word.id || ids.has(word.id)) throw new Error(`Invalid word identity in ${descriptor.id}`)
    if (!word.term || !word.meaningZh || !word.ipaUk || !word.ipaUs) throw new Error(`Incomplete word ${word.id}`)
    ids.add(word.id)
  }

  total += book.words.length
  catalog.push({
    id: descriptor.id,
    label: descriptor.label,
    grade: descriptor.grade,
    semester: descriptor.semester,
    status: book.status,
    verifiedWordCount: book.status === 'verified' ? book.words.length : 0,
    availableWordCount: book.words.length,
  })
  await writeFile(resolve(booksRoot, `${descriptor.id}.json`), `${JSON.stringify({ bookId: descriptor.id, words: book.words })}\n`, 'utf8')
}

if (total !== 1175) throw new Error(`Expected 1175 words, received ${total}`)
await writeFile(resolve(outputRoot, 'catalog.json'), `${JSON.stringify({ books: catalog })}\n`, 'utf8')
await writeFile(resolve(outputRoot, 'provenance.json'), `${JSON.stringify({
  generatedFrom: ['content/manifest.json', 'content/sourced-vocabulary.json', 'content/sources.json'],
  curriculumStatus: 'public-source-matched',
  publisher: manifest.series.publisher,
  series: manifest.series.name,
  curriculumStandard: manifest.series.curriculumStandard,
  warning: '公开来源匹配词表，仍需与手中教材逐页复核；不声称为出版社官方数字资源。',
  totalWords: total,
})}\n`, 'utf8')

console.log(`Generated ${catalog.length} books and ${total} words.`)
