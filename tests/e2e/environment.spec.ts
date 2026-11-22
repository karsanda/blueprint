import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, probeText, readLog } from './launch'

/** A home whose login profile marks the environment and puts its own folder first on PATH. */
function homeWithProfile(): string {
  const home = mkdtempSync(join(process.env.BLUEPRINT_E2E_ROOT ?? tmpdir(), 'blueprint-e2e-home-'))
  mkdirSync(join(home, 'extra'))
  writeFileSync(join(home, '.profile'), 'export BLUEPRINT_LOGIN_MARK=yes\nexport PATH="$HOME/extra:$PATH"\n')
  return home
}

function claudeEnv(log: string): { BLUEPRINT_LOGIN_MARK?: string; PATH?: string } {
  const first = readLog(log, 'claude.start').trim().split('\n')[0] ?? '{}'
  const parsed: { env?: { BLUEPRINT_LOGIN_MARK?: string; PATH?: string } } = JSON.parse(first)
  return parsed.env ?? {}
}

test("Claude Code gets the login shell's environment when Blueprint starts from the desktop", async () => {
  const home = homeWithProfile()
  const { app, page, log } = await launch({ home, shell: '/bin/sh', env: { TERM: undefined } })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  expect(claudeEnv(log).BLUEPRINT_LOGIN_MARK).toBe('yes')
  expect(claudeEnv(log).PATH?.startsWith(`${home}/extra:`)).toBe(true)
  await app.close()
})

test('a start from a terminal skips the login shell', async () => {
  const home = homeWithProfile()
  const { app, page, log } = await launch({ home, shell: '/bin/sh' })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  expect(claudeEnv(log).BLUEPRINT_LOGIN_MARK).toBeUndefined()
  await app.close()
})
