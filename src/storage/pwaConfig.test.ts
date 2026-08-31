// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pwaOptions } from '../../vite.config'

function pngDimensions(path: string) {
  const bytes = readFileSync(path)
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function reviewedAssetFingerprint(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('production PWA contract', () => {
  it('uses truthful local-first manifest metadata and exact maskable icons', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate')
    expect(pwaOptions.devOptions).toMatchObject({ enabled: false })
    expect(pwaOptions.manifest).toMatchObject({
      name: '词星球 · 小学英语单词乐园', short_name: '词星球', lang: 'zh-CN', dir: 'ltr',
      display: 'standalone', start_url: '/word-planet/', scope: '/word-planet/',
      icons: [
        { src: '/word-planet/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/word-planet/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    })
  })

  it('precache includes only safe app-shell asset types and explicitly excludes concepts and maps', () => {
    expect(pwaOptions).not.toHaveProperty('includeAssets')
    expect(pwaOptions.includeManifestIcons).toBe(false)
    expect(pwaOptions.workbox).toMatchObject({
      navigateFallback: '/word-planet/index.html',
      globPatterns: ['**/*.{js,css,html,json,png,svg,woff2}'],
      globIgnores: expect.arrayContaining(['**/concepts/**', '**/*.map']),
    })
    expect(pwaOptions.workbox).toHaveProperty('runtimeCaching')
  })

  it('ships only the two inspected exact-size final icon PNGs', () => {
    const iconDirectory = resolve(process.cwd(), 'public/icons')
    expect(readdirSync(iconDirectory).sort()).toEqual(['icon-192.png', 'icon-512.png'])
    expect(pngDimensions(resolve(iconDirectory, 'icon-192.png'))).toEqual({ width: 192, height: 192 })
    expect(pngDimensions(resolve(iconDirectory, 'icon-512.png'))).toEqual({ width: 512, height: 512 })
    // These are the exact 192/512 exports inspected with the full mascot inside the central maskable safe zone.
    expect([
      reviewedAssetFingerprint(resolve(iconDirectory, 'icon-192.png')),
      reviewedAssetFingerprint(resolve(iconDirectory, 'icon-512.png')),
    ]).toEqual([
      'b5f2e24bcfba62b130739f8889a4932c32c6a5fc9c5ff1926c07cf2e19926751',
      '35d26c6f7dd169f446c6d055f6a765ec1becf9851478ddaca255b2d3a74b217d',
    ])
  })
})
