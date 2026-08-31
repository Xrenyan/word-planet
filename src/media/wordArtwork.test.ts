import { describe, expect, it } from 'vitest'
import { wordFallbackDataUrl } from './wordArtwork'

describe('wordFallbackDataUrl', () => {
  it('creates a stable self-contained SVG memory card without network assets', () => {
    const first = wordFallbackDataUrl({ id: 'apple-1', term: 'apple', meaningZh: '苹果' })
    const second = wordFallbackDataUrl({ id: 'apple-1', term: 'apple', meaningZh: '苹果' })

    expect(first).toBe(second)
    expect(first).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/)
    expect(decodeURIComponent(first)).toContain('apple')
    expect(decodeURIComponent(first)).toContain('苹果')
  })

  it('escapes user-visible vocabulary text before inserting it into SVG markup', () => {
    const svg = decodeURIComponent(wordFallbackDataUrl({ id: 'unsafe', term: '<cat>', meaningZh: '猫 & 宠物' }))

    expect(svg).toContain('&lt;cat&gt;')
    expect(svg).toContain('猫 &amp; 宠物')
    expect(svg).not.toContain('<cat>')
  })
})
