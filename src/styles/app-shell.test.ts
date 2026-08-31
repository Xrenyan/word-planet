import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles/app-shell.css'), 'utf8')

describe('responsive app-shell layout contracts', () => {
  it('gives each mobile primary action a full row above the fixed navigation', () => {
    expect(styles).toMatch(
      /@media \(max-width: 767px\), \(max-width: 1179px\) and \(orientation: portrait\)[\s\S]*?\.today-page__actions\s*\{[^}]*grid-template-columns:\s*1fr;/,
    )
  })

  it('budgets the desktop today stage to the visible viewport instead of relying on scroll', () => {
    expect(styles).toMatch(
      /@media \(min-width: 1180px\)[\s\S]*?\.today-page\s*\{[^}]*height:\s*calc\(100vh - var\(--space-8\)\);/,
    )
  })

  it('keeps the bubble game inside its responsive shell and removes floating movement on reduced motion', () => {
    expect(styles).toMatch(/\.bubble-game__stage\s*\{[^}]*grid-template-columns:\s*minmax\(220px, \.8fr\) minmax\(0, 1\.2fr\);/)
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.bubble-game__stage\s*\{[^}]*grid-template-columns:\s*1fr;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.bubble-game__choice\s*\{[^}]*animation:\s*none;/)
  })

  it('reserves success styling for the explicitly correct bubble only', () => {
    expect(styles).toMatch(/\.bubble-game__choice:disabled\s*\{[^}]*background:\s*rgba\(255,255,255,\.72\)/)
    expect(styles).toMatch(/\.bubble-game__choice--correct:disabled\s*\{[^}]*background:\s*var\(--color-mint-100\)/)
  })

  it('keeps train and memory layouts mobile-safe and removes their motion for reduced motion users', () => {
    expect(styles).toMatch(/\.memory-game__deck\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/)
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.memory-game__deck\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.train-game__actions\s*\{[^}]*flex-direction:\s*column;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.memory-game__card-inner\s*\{[^}]*transition:\s*none;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.train-game__car\s*\{[^}]*animation:\s*none;/)
  })

  it('keeps delivery and guardian controls responsive, nav-safe and motion-optional', () => {
    expect(styles).toMatch(/\.delivery-game__stage\s*\{[^}]*grid-template-columns:\s*minmax\(220px, \.75fr\) minmax\(0, 1\.25fr\)/)
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.delivery-game__stage\s*\{[^}]*grid-template-columns:\s*1fr;/)
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.guardian-game__stage\s*\{[^}]*grid-template-columns:\s*1fr;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.delivery-game__target\s*\{[^}]*animation:\s*none;/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.guardian-game__progress li\s*\{[^}]*transition:\s*none;/)
  })
})
