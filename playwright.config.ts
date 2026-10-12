import { defineConfig, devices } from '@playwright/test'

// Uses an installed browser channel (Edge on Windows by default) so no browser download is needed.
// Override with PW_CHANNEL=chrome, or PW_CHANNEL=chromium after `npx playwright install chromium`.
const channel = process.env.PW_CHANNEL ?? 'msedge'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: channel === 'chromium' ? undefined : channel,
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: channel === 'chromium' ? undefined : channel } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: channel === 'chromium' ? undefined : channel } },
    {
      // the smallest supported width
      name: 'small-320',
      use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 }, channel: channel === 'chromium' ? undefined : channel },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
