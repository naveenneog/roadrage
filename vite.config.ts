import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'RoadRage',
        short_name: 'RoadRage',
        description: 'Street bike combat racing through Indian cities.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        categories: ['games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // The painted backdrops are ~250 KB in total; worth precaching so the
        // game looks the same offline as it does online.
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
});
