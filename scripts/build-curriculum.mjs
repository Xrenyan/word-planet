import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'content/manifest.json'), 'utf8'))
const sourced = JSON.parse(await readFile(resolve(root, 'content/sourced-vocabulary.json'), 'utf8'))
const pronunciations = JSON.parse(await readFile(resolve(root, 'content/pronunciations.json'), 'utf8'))
const artwork = JSON.parse(await readFile(resolve(root, 'content/word-artwork.json'), 'utf8'))
const photoRemoteArtwork = JSON.parse(await readFile(resolve(root, 'content/photo-word-remote-artwork.json'), 'utf8'))
const photoBook = JSON.parse(await readFile(resolve(root, 'content/g4-upper-photo-vocabulary.json'), 'utf8'))
const outputRoot = resolve(root, 'public/data')
const booksRoot = resolve(outputRoot, 'books')

if (!Array.isArray(manifest.books) || manifest.books.length !== 8) throw new Error('Expected exactly eight curriculum books')
if (!Array.isArray(sourced.books) || sourced.books.length !== 8) throw new Error('Expected exactly eight sourced vocabulary books')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(booksRoot, { recursive: true })

const sourcedById = new Map(sourced.books.map((book) => [book.id, book]))
const photoWords = photoBook.units.flatMap(({ unit, words }) => words.map(([term, meaningZh, page], index) => ({
  id: `photo-g4-upper-u${unit}-${index + 1}`, bookId: photoBook.bookId, unit, order: index + 1, term, meaningZh,
  ipaUk: '待核实', ipaUs: '待核实',
  image: { src: 'local:memory-card', alt: meaningZh, license: 'original-memory-card' },
  source: { title: `用户提供教材照片 · Unit ${unit} · 第${page}页`, page, url: 'https://github.com/Xrenyan/word-planet/blob/main/content/g4-upper-photo-vocabulary.json' },
  sourceConfidence: 'user-photo',
})))
sourcedById.set(photoBook.bookId, { id: photoBook.bookId, status: 'source-matched', words: photoWords })
const catalog = []
let total = 0

for (const descriptor of manifest.books) {
  const book = sourcedById.get(descriptor.id)
  if (!book) throw new Error(`Missing sourced vocabulary for ${descriptor.id}`)
  if (!['verified', 'source-matched'].includes(book.status)) throw new Error(`Unsafe curriculum status for ${descriptor.id}`)
  if (!Array.isArray(book.words) || book.words.length === 0) throw new Error(`No words for ${descriptor.id}`)

  const ids = new Set()
  const isNewSource = book.words.every(word => word.source.title.includes('(新)') || word.source.title.includes('（新）'))
  const isPhoto = descriptor.id === photoBook.bookId
  const editionLabel = isPhoto ? photoBook.editionLabel : isNewSource ? '来源标注新版 · Unit 编排' : '旧版 Module 编排'
  const editionNote = isPhoto ? photoBook.editionNote : isNewSource
    ? '公开来源标注“三起(新)”，尚未按教材版权页确认主编及出版年份，请与手中课本目录核对。'
    : '当前接入的是旧版 Module 1–10 词表，不是新版 Unit 词表；新版尚未完成来源核验。'
  for (const word of book.words) {
    if (word.bookId !== descriptor.id || !word.id || ids.has(word.id)) throw new Error(`Invalid word identity in ${descriptor.id}`)
    if (!word.term || !word.meaningZh || !word.ipaUk || !word.ipaUs) throw new Error(`Incomplete word ${word.id}`)
    ids.add(word.id)
    const match = word.source.title.match(/(unit|module)\s*(\d+)/i)
    word.unitLabel = /welcome/i.test(word.source.title) ? 'Welcome' : match ? `${match[1].toLowerCase() === 'unit' ? 'Unit' : 'Module'} ${Number(match[2])}` : `Unit ${word.unit}`
    word.editionNote = editionNote
    const termKey = word.term.toLowerCase().trim()
    const phonetics = pronunciations.wordOverrides?.[word.id] ?? pronunciations.entries[termKey]
    const illustration = artwork.entries?.[termKey] ?? artwork[termKey] ?? (isPhoto ? photoRemoteArtwork.entries?.[termKey] ?? photoRemoteArtwork[termKey] : undefined)
    word.image = illustration ?? (/^https:\/\//.test(word.image.src) ? word.image : { src: 'local:meaning-clue', alt: word.meaningZh, license: 'meaning-clue' })
    word.ipaUk = phonetics?.uk ?? '待核实'
    word.ipaUs = phonetics?.us ?? '待核实'
    word.ipaStatus = phonetics?.uk || phonetics?.us || phonetics?.common ? 'public-source' : 'unavailable'
    word.ipaCommon = phonetics?.common ?? undefined
    word.ipaSource = phonetics?.source
    word.ipaNote = phonetics?.note ?? pronunciations.note
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
    editionLabel,
    editionNote,
  })
  await writeFile(resolve(booksRoot, `${descriptor.id}.json`), `${JSON.stringify({ bookId: descriptor.id, words: book.words })}\n`, 'utf8')
}

if (total < 1) throw new Error('No vocabulary was generated')
await writeFile(resolve(outputRoot, 'catalog.json'), `${JSON.stringify({ books: catalog })}\n`, 'utf8')
await writeFile(resolve(outputRoot, 'provenance.json'), `${JSON.stringify({
  generatedFrom: ['content/manifest.json', 'content/sourced-vocabulary.json', 'content/g4-upper-photo-vocabulary.json', 'content/pronunciations.json', 'content/word-artwork.json', 'content/sources.json'],
  curriculumStatus: 'public-source-matched',
  publisher: manifest.series.publisher,
  series: manifest.series.name,
  warning: '四上已用165词教材照片词表替换旧版；其余册次来源与版本逐册标注，不统称全套新版。',
  pronunciationSource: pronunciations.source,
  totalWords: total,
})}\n`, 'utf8')

console.log(`Generated ${catalog.length} books and ${total} words.`)
