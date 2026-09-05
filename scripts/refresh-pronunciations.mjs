// Extract English Wiktionary IPA only. Never infer an accent or a phrase.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractEnglishIpa } from './reference-assets.mjs'
const root = resolve(import.meta.dirname, '..')
const source = JSON.parse(await readFile(resolve(root, 'content/sourced-vocabulary.json'), 'utf8'))
const photo = JSON.parse(await readFile(resolve(root, 'content/g4-upper-photo-vocabulary.json'), 'utf8'))
const originals = new Map(source.books.filter(book => book.id !== photo.bookId).flatMap(book => book.words.map(word => [word.term.toLowerCase().trim(), word.term])))
for (const unit of photo.units) for (const [term] of unit.words) originals.set(term.toLowerCase().trim(), term)
const aliases = { 'no.': 'number', 'a (an)': 'a', 'be (am,is,are)': 'be', 'dad (father)': 'dad', 'mum (mother)': 'mum', 'grandma (grandmother)': 'grandma', 'grandpa (grandfather)': 'grandpa', "couldn't=could not": "couldn't", "didn't= did not": "didn't", "wasn't=was not": "wasn't", "weren't= were not": "weren't", "won't= will not": "won't", "let's = let us": "let's" }
const previous = JSON.parse(await readFile(resolve(root, 'content/pronunciations.json'), 'utf8'))
const entries = Object.fromEntries(Object.entries(previous.entries).filter(([term]) => originals.has(term)))
let index = 0
const photoTerms = new Set(photo.units.flatMap(unit => unit.words.map(([term]) => term.toLowerCase().trim())))
const terms = [...originals.keys()].filter(term => !entries[term] || entries[term].missing === 'request-failed').sort((a,b) => Number(photoTerms.has(b)) - Number(photoTerms.has(a)) || a.localeCompare(b))
async function checkpoint() {
  await writeFile(resolve(root, 'content/pronunciations.json'), JSON.stringify({ ...previous, retrievedAt: new Date().toISOString(), entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) }, null, 2) + '\n')
}
async function worker() {
  while (index < terms.length) {
    const term = terms[index++]
    const page = aliases[term] ?? originals.get(term).replaceAll('’', "'").replace(/[.!！…]+$/, '').replace(/\s+/g, ' ').trim()
    let result
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text|revid&format=json&redirects=1`, {
          signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WordPlanet/1.1 (educational vocabulary; github.com/Xrenyan/word-planet)' },
        })
        if (response.status === 429) { console.log('Rate limited: stopped; existing sources and progress retained.'); return }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const json = await response.json()
        if (json.error) { result = { uk: null, us: null, common: null, missing: json.error.code }; break }
        result = { ...extractEnglishIpa(json.parse.text['*']), revision: json.parse.revid }
        break
      } catch (error) { if (attempt === 2) console.log(`${term}: ${error.message}`); await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1))) }
    }
    entries[term] = { ...result ?? { uk: null, us: null, common: null, missing: 'request-failed' }, source: `https://en.wiktionary.org/wiki/${encodeURIComponent(page)}#English` }
    if (index % 25 === 0) { console.log(`Refreshed ${index}/${terms.length}`); await checkpoint() }
    await new Promise(resolve => setTimeout(resolve, 600))
  }
}
await worker()
await writeFile(resolve(root, 'content/pronunciations.json'), JSON.stringify({
  ...previous, retrievedAt: new Date().toISOString(),
  entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + '\n')
await import('./apply-verified-phonetics.mjs')
console.log(JSON.stringify({ total: terms.length, regional: Object.values(entries).filter(x => x.uk || x.us).length, available: Object.values(entries).filter(x => x.uk || x.us || x.common).length }))
