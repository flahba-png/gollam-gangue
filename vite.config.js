import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Gollam Platform',
        short_name: 'Gollam',
        description: 'Gestion commerciale multi-boutiques — Côte d\'Ivoire',
        theme_color: '#0C1016',
        background_color: '#0C1016',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr',
        start_url: '/',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Met en cache la coquille de l'app pour un démarrage hors-ligne
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Mises à jour propres : la nouvelle version prend la main immédiatement
        // et l'ancien cache (fichiers obsolètes) est supprimé → plus d'écran noir.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Les appels Supabase : réseau d'abord, cache en secours
            urlPattern: ({ url }) => url.host.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
