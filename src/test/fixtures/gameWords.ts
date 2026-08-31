import type { PublicMatchedGameWord } from '../../data/publicMatchedGameWord'

function word(id: string, term: string, meaningZh: string): PublicMatchedGameWord {
  return {
    scope: '公开来源匹配', disclaimer: '待手中教材页复核', id, term, meaningZh,
    partOfSpeech: 'not-specified', ipaUk: `/${term}/`, ipaUs: `/${term}/`, grade: 3, semester: 'upper', unit: 1,
    listType: 'source-matched', image: { src: `/api/word-art/${id}.svg`, alt: `${meaningZh}测试插图`, license: 'test-fixture', reviewed: true },
    audio: { uk: { source: 'system-voice', locale: 'en-GB' }, us: { source: 'system-voice', locale: 'en-US' } }, reviewStatus: 'source-matched',
  }
}

export const demoWords = Object.freeze([
  word('fixture-planet', 'planet', '行星'),
  word('fixture-cat', 'cat', '猫'),
  word('fixture-dog', 'dog', '狗'),
  word('fixture-sun', 'sun', '太阳'),
])
