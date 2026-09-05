// Import only pronunciation facts, never substitute another textbook's vocabulary.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const base = 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/'
const files = ['Oxford5000.json', 'ChuZhongluan_2_T.json', 'Macmillan7000.json', 'CET4_T.json', 'CET6_T.json', 'IELTS_3_T.json', 'TOEFL_3_T.json', 'Level8luan_2_T.json', ...[3,4,5,6].flatMap(g => [1,2].map(s => `PEPXiaoXue${g}_${s}_T.json`))]
const source = JSON.parse(await readFile('content/sourced-vocabulary.json', 'utf8'))
const photo = JSON.parse(await readFile('content/g4-upper-photo-vocabulary.json', 'utf8'))
const terms = new Set([...source.books.filter(b => b.id !== photo.bookId).flatMap(b => b.words.map(w => w.term)), ...photo.units.flatMap(u => u.words.map(([t]) => t))].map(t => t.toLowerCase().trim()))
const prior = JSON.parse(await readFile('content/pronunciations.json', 'utf8'))
const entries = Object.fromEntries(Object.entries(prior.entries).filter(([term]) => terms.has(term)))
const normalize = value => !value?.trim() ? null : `/${value.trim().replaceAll("'",'ˈ').replaceAll('，','; ').replaceAll('；','; ').replace(/^,+/,'ˌ')}/`
for (const file of files) {
  const response = await fetch(`${base}public/dicts/${file}`)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  const words = await response.json()
  let added = 0
  for (const word of words) {
    const term = word.name.toLowerCase().trim()
    if (!terms.has(term) || entries[term]?.referenceDataset || !word.ukphone || !word.usphone) continue
    entries[term] = {uk:normalize(word.ukphone), us:normalize(word.usphone), common:null, source:`https://github.com/RealKai42/qwerty-learner/blob/master/public/dicts/${file}`, referenceDataset:file, note:'Qwerty Learner 公开词库中的英美参考音标；保留来源的音标体系，美式部分使用 KK 记号。不是教材官方音标。'}
    added++
  }
  console.log(`${file}: ${added}`)
}
// These homographs use the meaning in this curriculum, not the adjective/verb alternatives.
for (const [term, uk, us] of [['live','lɪv','lɪv'], ['wind','wɪnd','wɪnd'], ['minute','ˈmɪnɪt','ˈmɪnɪt']]) {
  if (terms.has(term)) entries[term] = {uk:`/${uk}/`,us:`/${us}/`,common:null,source:'https://github.com/RealKai42/qwerty-learner/blob/master/public/dicts/ChuZhongluan_2_T.json',note:'从来源的多音变体中按教材词义选择：live 居住；wind 风；minute 分钟。'}
}
await writeFile('content/pronunciations.json', JSON.stringify({...prior, source:'https://github.com/RealKai42/qwerty-learner', sources:['https://github.com/RealKai42/qwerty-learner','https://en.wiktionary.org'], retrievedAt:new Date().toISOString(), note:'英美词典参考音标，非教材官方音标；逐词保留来源与音标体系。通用音标不冒充两套口音；未找到的完整短语音标不拼接、不推测。',entries},null,2)+'\n')
await mkdir('public/licenses',{recursive:true})
const license = await fetch(`${base}LICENSE`).then(r=>r.text())
await writeFile('public/licenses/QWERTY-GPL-3.0.txt', license)
await import('./apply-verified-phonetics.mjs')
Object.assign(entries, JSON.parse(await readFile('content/pronunciations.json', 'utf8')).entries)
console.log({total:terms.size, available:Object.values(entries).filter(p=>p.uk||p.us||p.common).length, both:Object.values(entries).filter(p=>p.uk&&p.us).length, photoMissing:photo.units.flatMap(u=>u.words).filter(([t])=>!entries[t.toLowerCase()]?.uk || !entries[t.toLowerCase()]?.us).map(([t])=>t)})
