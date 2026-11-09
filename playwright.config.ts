import { defineConfig } from '@playwright/test'
import path from 'node:path'

const BACKEND_DIR = process.env.BACKEND_DIR ?? path.resolve(process.cwd(), '../PP-AI-Service')
const API_PORT = process.env.E2E_API_PORT ?? '8010'
const WEB_PORT = '5174'

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: `${BACKEND_DIR}/venv/bin/python e2e/backend.py`,
      url: `http://127.0.0.1:${API_PORT}/api/spy-hunt/health`,
      env: { BACKEND_DIR, SPY_HUNT_FAKE_LLM: '1', E2E_API_PORT: API_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `yarn vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
