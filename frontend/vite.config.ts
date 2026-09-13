/**
 * Vite configuration.
 *
 * The browser only ever talks to this dev server: `/api` is proxied to FastAPI,
 * which keeps the app same-origin (no CORS surprises, no hardcoded localhost in
 * client code) and works unchanged behind a tunnelled preview host.
 *
 * No Node types are needed here — `loadEnv` reads VITE_* variables for us.
 */

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const apiTarget = env.VITE_API_PROXY || 'http://127.0.0.1:8000'

  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      // Allow any host so tunnelled preview domains are not rejected.
      allowedHosts: true,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
      proxy,
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Split the two heaviest dependencies so the first paint stays small.
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (/react|react-dom|react-router|scheduler/.test(id)) return 'react'
              if (/framer-motion|motion-dom/.test(id)) return 'motion'
              if (/lucide/.test(id)) return 'icons'
            }
            return undefined
          },
        },
      },
    },
  }
})
