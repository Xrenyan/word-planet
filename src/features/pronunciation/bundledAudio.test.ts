// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const publicRoot = join(process.cwd(), 'public')
const audioMap = JSON.parse(readFileSync(join(publicRoot, 'audio/map.json'), 'utf8')) as {
  terms: Record<string, Record<string, string>>
  words?: Record<string, Record<string, string>>
}
const words = readdirSync(join(publicRoot, 'data/books')).flatMap(file =>
  (JSON.parse(readFileSync(join(publicRoot, 'data/books', file), 'utf8')) as { words: { id: string; term: string; meaningZh: string }[] }).words)

describe('bundled pronunciation integrity', () => {
  it('supplies an actual MP3 for each curriculum word in both accents', () => {
    const inspected = new Set<string>()
    for (const word of words) {
      for (const locale of ['en-GB', 'en-US']) {
        const relative = audioMap.words?.[word.id]?.[locale] ?? audioMap.terms[word.term.toLocaleLowerCase('en').trim()]?.[locale]
        expect(relative, `${word.id} ${word.term} ${locale}`).toBeTruthy()
        if (inspected.has(relative)) continue
        inspected.add(relative)
        const bytes = readFileSync(join(publicRoot, relative.split('?')[0]))
        expect(bytes.byteLength, relative).toBeGreaterThan(512)
        const mp3Header = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
        expect(mp3Header, relative).toBe(true)
      }
    }
  })

  it('keeps past read separate from present read in each accent', () => {
    const past = words.find(word => word.term === 'read' && word.meaningZh.includes('过去式'))!
    expect(past).toBeDefined()
    for (const locale of ['en-GB', 'en-US']) {
      const override = audioMap.words?.[past.id]?.[locale]
      expect(override).toBeTruthy()
      expect(override).not.toBe(audioMap.terms.read[locale])
      const pastBytes = readFileSync(join(publicRoot, override!.split('?')[0]))
      const presentBytes = readFileSync(join(publicRoot, audioMap.terms.read[locale].split('?')[0]))
      expect(pastBytes.equals(presentBytes)).toBe(false)
    }
  })
})
