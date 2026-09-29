import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'logo-mark.webp', 'logo-mark.avif'],
      manifest: {
        name: 'Gravity',
        short_name: 'Gravity',
        description: 'A private home base for your family.',
        theme_color: '#070b14',
        background_color: '#070b14',
        display: 'standalone',
        start_url: '/app',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/config\.json$/], globPatterns: ['**/*.{js,css,html,png,webp,avif,woff2}'] },
    }),
  ],
  server: { port: Number(process.env.WEB_PORT ?? 5174), strictPort: true, host: true, proxy: { '/api': process.env.GRAVITY_API ?? 'http://127.0.0.1:8787' } },
  build: {
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion'],
          query: ['@tanstack/react-query'],
          oidc: ['oidc-client-ts'],
        },
      },
    },
  },
});
