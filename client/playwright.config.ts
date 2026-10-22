import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real web app (a production build) against the real API
 * and a fresh database of demo data, in three browser engines on desktop and
 * two on phones. Run with `npm run e2e`; CI runs the Chromium project.
 *
 * Ports 4100 (API) and 4174 (web) are kept apart from development (4000, 5173),
 * and the database is isoko_talents_e2e, reset on every run (e2e/start-api.sh).
 */
const API_PORT = 4100;
const WEB_PORT = 4174;
const WEB = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One at a time: the tests share one database and its demo accounts.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: [
    {
      command: 'sh e2e/start-api.sh',
      url: `http://localhost:${API_PORT}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DB_NAME: process.env.E2E_DB_NAME ?? 'isoko_talents_e2e',
        APP_URL: WEB,
        CORS_ORIGINS: WEB,
        // Nothing leaves the machine: simulated payments, logged SMS and email, files on disk.
        PAYMENT_PROVIDER: 'simulated-momo',
        SMS_DRIVER: 'log',
        EMAIL_DRIVER: 'log',
        STORAGE_DRIVER: 'local',
        // No automatic invitations when a gig is approved, so a worker in a test
        // applies rather than finding themselves already invited by the ranking.
        RANKED_INVITE_LIMIT: '0',
        EXPLORATION_SLOTS: '0',
      },
    },
    {
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: WEB,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
});
