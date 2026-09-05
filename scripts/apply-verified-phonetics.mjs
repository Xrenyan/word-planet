// These small corrections are manually checked against the linked dictionary pages.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const file = resolve(root, 'content/pronunciations.json')
const data = JSON.parse(await readFile(file, 'utf8'))
const supplements = JSON.parse(await readFile(resolve(root, 'content/verified-phonetic-supplements.json'), 'utf8'))
const wordOverrides = JSON.parse(await readFile(resolve(root, 'content/verified-word-phonetic-overrides.json'), 'utf8'))
Object.assign(data.entries, supplements)
data.wordOverrides = { ...data.wordOverrides, ...wordOverrides }
data.sources = [...new Set([...Object.values(data.entries), ...Object.values(data.wordOverrides)].map(entry => new URL(entry.source).origin))]
await writeFile(file, JSON.stringify(data, null, 2) + '\n')
console.log(`Applied ${Object.keys(supplements).length} verified pronunciation entries and ${Object.keys(wordOverrides).length} word-specific overrides.`)
