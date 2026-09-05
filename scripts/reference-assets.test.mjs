import test from 'node:test'
import assert from 'node:assert/strict'

test('unqualified English IPA is retained after enPR without claiming an accent', async () => {
  const { extractEnglishIpa } = await import('./reference-assets.mjs')
  const result = extractEnglishIpa('<h2>English</h2><h3>Pronunciation</h3><ul><li>enPR: bēp, IPA: <span class="IPA">/biːp/</span></li></ul><h2>Romanian</h2><h3>Pronunciation</h3><ul><li>IPA: <span class="IPA">/bip/</span></li></ul>')
  assert.deepEqual(result, { uk: null, us: null, common: '/biːp/' })
})

test('IPA preserves regional labels and skips rhymes or phonetic brackets', async () => {
  const { extractEnglishIpa } = await import('./reference-assets.mjs')
  const html = '<h2>English</h2><h3>Pronunciation</h3><ul><li>(UK) IPA: <span class="IPA">/hɛlpə/</span></li><li>(General American) IPA: <span class="IPA">/hɛlpɚ/</span>, <span class="IPA">[hɛlpɚ]</span></li><li>(Australia) IPA: <span class="IPA">/other/</span></li><li>Rhymes: <span class="IPA">/bad/</span></li></ul>'
  assert.deepEqual(extractEnglishIpa(html), { uk: '/hɛlpə/', us: '/hɛlpɚ/', common: null })
})

test('artwork import refuses a catalog mismatch and unsafe SVG markup', async () => {
  const { artworkRecord, validateSvg } = await import('./reference-assets.mjs')
  assert.throws(() => artworkRecord({ annotation: 'cow', alt: '奶牛' }, []), /catalog/)
  assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), /unsafe/)
  assert.throws(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M1 2L3 4"/></svg>'), /unsafe/)
  assert.throws(() => validateSvg('<html>not an asset</html>'), /SVG/)
  assert.doesNotThrow(() => validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path d="M1 2L3 4"/></svg>'))
})

test('artwork output preserves source and individual author attribution', async () => {
  const { artworkRecord } = await import('./reference-assets.mjs')
  const result = artworkRecord({ annotation: 'cow', alt: '奶牛' }, [{ annotation: 'cow', hexcode: '1F404', openmoji_author: 'Test Artist', skintone: '' }])
  assert.equal(result.src, 'word-art/1F404.svg')
  assert.equal(result.alt, '奶牛')
  assert.equal(result.author, 'Test Artist')
  assert.equal(result.license, 'CC BY-SA 4.0')
  assert.match(result.source, /17\.0\.0\/color\/svg\/1F404\.svg$/)
})
