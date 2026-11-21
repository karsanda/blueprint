import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  globalSetup: './tests/e2e/global_setup.ts',
  globalTeardown: './tests/e2e/global_teardown.ts',
})
