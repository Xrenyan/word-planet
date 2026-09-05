import { JSDOM } from 'jsdom'

export const OPENMOJI_VERSION = '17.0.0'
export const OPENMOJI_BASE = `https://raw.githubusercontent.com/hfg-gmuend/openmoji/${OPENMOJI_VERSION}`

export function extractEnglishIpa(html) {
  const dom = new JSDOM(html)
  const values = { uk: new Set(), us: new Set(), common: new Set() }
  let english = false, pronunciation = false
  for (const element of dom.window.document.querySelectorAll('h2,h3,h4,h5,.IPA')) {
    if (element.matches('h2')) { english = element.textContent.replace(/\[edit\]/g, '').trim() === 'English'; pronunciation = false; continue }
    if (element.matches('h3,h4,h5')) { pronunciation = /^Pronunciation/.test(element.textContent.trim()); continue }
    if (!english || !pronunciation || !/^\/[^/]+\/$/.test(element.textContent.trim())) continue
    const line = element.closest('li')
    if (!line || !line.textContent.includes('IPA')) continue
    // enPR before IPA is an alternate transcription, not a regional qualifier.
    const prefix = line.textContent.split('IPA')[0].replace(/enPR\s*:[^,]+,?\s*/g, '').trim()
    const uk = /Received Pronunciation|General British|Standard Southern British|\bUK\b|\bRP\b|British/.test(prefix)
    const us = /General American|\bUS\b|\bGA\b|\bAmerican\b/.test(prefix)
    if (uk) values.uk.add(element.textContent.trim())
    if (us) values.us.add(element.textContent.trim())
    if (!uk && !us && !prefix) values.common.add(element.textContent.trim())
  }
  dom.window.close()
  return Object.fromEntries(Object.entries(values).map(([accent, set]) => [accent, [...set].join(', ') || null]))
}

export function validateSvg(svg) {
  let dom
  try { dom = new JSDOM(svg, { contentType: 'image/svg+xml' }) } catch { throw new Error('Invalid SVG document') }
  try {
    const root = dom.window.document.documentElement
    if (root.localName !== 'svg') throw new Error('Expected SVG document')
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (/^(script|foreignObject|iframe|image)$/i.test(element.localName)) throw new Error('unsafe SVG element')
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name) || (/href$/i.test(attribute.name) && !attribute.value.startsWith('#'))) throw new Error('unsafe SVG attribute')
      }
    }
  } finally { dom.window.close() }
}

export function artworkRecord(spec, catalog) {
  const asset = catalog.find(item => item.annotation === spec.annotation && !item.skintone)
  if (!asset || !/^[A-F0-9-]+$/.test(asset.hexcode)) throw new Error(`OpenMoji catalog mismatch: ${spec.annotation}`)
  return {
    src: `word-art/${asset.hexcode}.svg`, alt: spec.alt,
    license: 'CC BY-SA 4.0', author: asset.openmoji_author,
    source: `${OPENMOJI_BASE}/color/svg/${asset.hexcode}.svg`,
    sourceAnnotation: asset.annotation,
    ...(spec.note ? { note: spec.note } : {}),
  }
}
