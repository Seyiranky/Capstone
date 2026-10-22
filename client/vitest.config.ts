import { defineConfig } from 'vitest/config';

// Unit tests only: files under src/. The browser tests in e2e/ are Playwright's
// (npm run e2e) and would fail if Vitest tried to run them.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
