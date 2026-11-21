import { defineConfig } from '@playwright/test'

/** Screenshot capture for visual checks: `pnpm shots` writes .shots/*.png. */
export default defineConfig({
  testDir: 'tests/shots',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  globalSetup: './tests/e2e/global_setup.ts',
  globalTeardown: './tests/e2e/global_teardown.ts',
})
