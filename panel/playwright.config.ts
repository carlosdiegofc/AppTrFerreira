import { defineConfig, devices } from '@playwright/test';

// The test database and PostgREST must be running (see tests/e2e/README.md); the panel stand-in server starts here.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8791/',
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    // Map animations are timed with the clock, which the tests fix: the panel skips them for reduced motion.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    // This container ships its own Chromium; CI installs the one that matches Playwright.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:8791/healthz', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
});
