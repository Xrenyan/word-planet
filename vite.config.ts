import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'

const base = '/word-planet/'

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeManifestIcons: false,
  devOptions: { enabled: false },
  manifest: {
    name: '词星球 · 小学英语单词乐园',
    short_name: '词星球',
    description: '外研版三年级起点三至六年级英语单词学练一体应用。学习记录保存在此设备。',
    lang: 'zh-CN',
    dir: 'ltr',
    display: 'standalone',
    start_url: base,
    scope: base,
    theme_color: '#78c9ff',
    background_color: '#eef8ff',
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,json,png,svg,woff2}'],
    globIgnores: ['**/concepts/**', '**/*.map', '**/*report*', '**/*ledger*'],
    navigateFallback: `${base}index.html`,
    cleanupOutdatedCaches: true,
    runtimeCaching: [{
      urlPattern: /^https:\/\/ywld-1315558954\.51jiaoxi\.com\//,
      handler: 'CacheFirst',
      options: { cacheName: 'word-planet-remote-art', expiration: { maxEntries: 180, maxAgeSeconds: 2592000 } }
    }, {
      urlPattern: /\/word-planet\/audio\/.*\.mp3(?:\?.*)?$/,
      handler: 'CacheFirst',
      options: { cacheName: 'word-planet-pronunciation', expiration: { maxEntries: 500, maxAgeSeconds: 2592000 } }
    }]
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA(pwaOptions)
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'scripts/*.test.mjs']
  }
})
