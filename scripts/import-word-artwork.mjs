// Local, unmodified source artwork. No generated SVG and no platform emoji font.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { artworkRecord, validateSvg, OPENMOJI_BASE, OPENMOJI_VERSION } from './reference-assets.mjs'
const root = resolve(import.meta.dirname, '..')
const selections = JSON.parse(await readFile(resolve(root, 'content/word-artwork-selection.json'), 'utf8'))
const source = JSON.parse(await readFile(resolve(root, 'content/sourced-vocabulary.json'), 'utf8'))
const photo = JSON.parse(await readFile(resolve(root, 'content/g4-upper-photo-vocabulary.json'), 'utf8'))
const terms = new Set([...source.books.filter(b => b.id !== photo.bookId).flatMap(b => b.words.map(w => w.term)), ...photo.units.flatMap(u => u.words.map(([term]) => term))].map(t => t.toLowerCase().trim()))
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.text()
}
const catalog = JSON.parse(await fetchText(`${OPENMOJI_BASE}/data/openmoji.json`))
const entries = Object.fromEntries(Object.entries(selections).filter(([term]) => terms.has(term)).map(([term, spec]) => [term, artworkRecord(spec, catalog)]))
await mkdir(resolve(root, 'public/word-art'), { recursive: true })
const unique = [...new Map(Object.values(entries).map(entry => [entry.src, entry])).values()]
for (const entry of unique) {
  const svg = await fetchText(entry.source)
  validateSvg(svg)
  await writeFile(resolve(root, 'public', entry.src), svg)
}
await writeFile(resolve(root, 'content/word-artwork.json'), JSON.stringify(entries, null, 2) + '\n')
await mkdir(resolve(root, 'public/licenses'), { recursive: true })
await writeFile(resolve(root, 'public/licenses/OPENMOJI-CC-BY-SA-4.0.txt'), await fetchText(`${OPENMOJI_BASE}/LICENSE.txt`))
await writeFile(resolve(root, 'public/licenses/WORD-ARTWORK.txt'), `Vocabulary illustrations: OpenMoji ${OPENMOJI_VERSION}, by HfG Schwäbisch Gmünd and OpenMoji contributors.\nProject: https://openmoji.org/\nSource: https://github.com/hfg-gmuend/openmoji/tree/${OPENMOJI_VERSION}/color/svg\nLicense: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/\nUnmodified source SVGs copied locally. Individual authors, original annotations and source URLs are recorded in content/word-artwork.json.\nThese are reference illustrations, not textbook illustrations. Only manually selected, meaning-matched words receive artwork.\n`)
console.log(JSON.stringify({ terms: Object.keys(entries).length, assets: unique.length, photoIllustrated: photo.units.flatMap(u => u.words).filter(([term]) => entries[term.toLowerCase()]).length, photoTotal: photo.units.flatMap(u => u.words).length }))
