import { defineConfig, devices } from '@playwright/test'

const apiPort = Number(process.env.TEST_API_PORT || 18787)
const webPort = Number(process.env.TEST_WEB_PORT || 15173)
const baseURL = `http://127.0.0.1:${webPort}`
const projects = [
  {
    name: 'mobile-chromium',
    use: { ...devices['iPhone 13'], browserName: 'chromium' },
  },
  {
    name: 'desktop-chromium',
    use: { ...devices['Desktop Chrome'] },
  },
]

if (process.env.CI) {
  projects.push({
    name: 'mobile-webkit',
    use: { ...devices['iPhone 13'] },
  })
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node server/index.js',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(apiPort),
        NODE_ENV: 'test',
        ADMIN_EMAILS: [
          'e2e-mobile-chromium@example.test',
          'e2e-desktop-chromium@example.test',
          'e2e-mobile-webkit@example.test',
          'archive-mobile-chromium@example.test',
          'archive-desktop-chromium@example.test',
          'archive-mobile-webkit@example.test',
        ].join(','),
        DISABLE_BACKGROUND_JOBS: '1',
        SKIP_DEFAULT_PRODUCTS: '1',
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: baseURL,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects,
})
