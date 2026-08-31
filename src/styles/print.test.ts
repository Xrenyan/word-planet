import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles/print.css'), 'utf8')

describe('print worksheet contracts', () => {
  it('defines named A4 portrait and landscape pages with millimetre margins', () => {
    expect(styles).toMatch(/@page worksheet-portrait\s*\{[^}]*size:\s*A4 portrait;[^}]*margin:\s*\d+mm;/s)
    expect(styles).toMatch(/@page worksheet-landscape\s*\{[^}]*size:\s*A4 landscape;[^}]*margin:\s*\d+mm;/s)
  })

  it('prints only worksheet pages without glass chrome, shadows or a trailing blank page', () => {
    expect(styles).toMatch(/@media print\s*\{[\s\S]*?\.app-shell__rail[\s\S]*?display:\s*none\s*!important;/)
    expect(styles).toMatch(/@media print\s*\{[\s\S]*?\.worksheet-builder__screen-only[\s\S]*?display:\s*none\s*!important;/)
    expect(styles).toMatch(/\.printable-page\s*\{[^}]*break-after:\s*page;/s)
    expect(styles).toMatch(/\.printable-page:last-child\s*\{[^}]*break-after:\s*auto;/s)
    expect(styles).toMatch(/\.worksheet-print-section:not\(:last-child\) \.printable-page:last-child\s*\{[^}]*break-after:\s*page;/s)
    expect(styles).toMatch(/\.worksheet-print-section:last-child \.printable-page:last-child\s*\{[^}]*break-after:\s*auto;/s)
    expect(styles).toMatch(/@media print\s*\{[\s\S]*?box-shadow:\s*none\s*!important;/)
  })

  it('removes preview transitions for reduced-motion users', () => {
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.printable-page\s*\{[^}]*transition:\s*none;/)
  })

  it('gives the tablet worksheet controls enough width to avoid vertical Chinese labels', () => {
    expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.worksheet-builder__workspace\s*\{[^}]*grid-template-columns:\s*1fr;/)
  })
})
