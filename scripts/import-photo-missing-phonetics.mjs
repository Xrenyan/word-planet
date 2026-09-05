// Targeted dictionary refresh: only missing photo terms, with no accent inference.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extractEnglishIpa } from './reference-assets.mjs'
const root = resolve(import.meta.dirname, '..')
const photo = JSON.parse(await readFile(resolve(root, 'content/g4-upper-photo-vocabulary.json'), 'utf8'))
const file = resolve(root, 'content/pronunciations.json')
const prior = JSON.parse(await readFile(file, 'utf8'))
const terms = photo.units.flatMap(u => u.words.map(([term]) => term.toLowerCase().trim())).filter(term => !prior.entries[term]?.uk || !prior.entries[term]?.us)
for (const term of terms) {
  const page = term.replace(/[!.]+$/, '')
  const source = `https://en.wiktionary.org/wiki/${encodeURIComponent(page.replaceAll(' ', '_'))}`
  const response = await fetch(source, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WordPlanet/1.1 (educational vocabulary reference; github.com/Xrenyan/word-planet)' } })
  if (response.status === 429) { console.log('Rate limited: stopped without retrying.'); break }
  if (!response.ok) { console.log(`${term}: HTTP ${response.status}, existing entry retained`); continue }
  const html = await response.text()
  const ipa = extractEnglishIpa(html)
  const revision = Number(html.match(/"wgRevisionId":(\d+)/)?.[1] ?? html.match(/oldid=(\d+)/)?.[1]) || undefined
  if (ipa.uk || ipa.us || ipa.common) {
    prior.entries[term] = { ...ipa, source: `${source}#English`, ...(revision ? { revision } : {}), verifiedAt: new Date().toISOString(), note: '维基词典英语词条原文音标（CC BY-SA 4.0）；保留原有地域标注，通用音标不冒充英美两套。' }
  }
  console.log(`${term}: ${JSON.stringify(ipa)}`)
  await new Promise(resolve => setTimeout(resolve, 750))
}
prior.sources = ['https://github.com/RealKai42/qwerty-learner', 'https://en.wiktionary.org']
prior.retrievedAt = new Date().toISOString()
prior.note = '英美词典参考音标，非教材官方音标；逐词保留来源与音标体系。通用音标不冒充两套口音；未找到的完整短语音标不拼接、不推测。'
await writeFile(file, JSON.stringify(prior, null, 2) + '\n')
console.log(JSON.stringify({ photoTotal: terms.length, missing: terms.filter(term => !prior.entries[term]?.uk && !prior.entries[term]?.us && !prior.entries[term]?.common) }))
