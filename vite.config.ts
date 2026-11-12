import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  // VITE_BASE_PATH (e.g. "/spy-hunt") lets the same build serve from a subpath; unset = domain root.
  return {
    plugins: [react()],
    base: `${env.VITE_BASE_PATH ?? ''}/`,
    server: {
      proxy: { '/api': { target: process.env.API_PROXY ?? 'http://localhost:8000', changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})
