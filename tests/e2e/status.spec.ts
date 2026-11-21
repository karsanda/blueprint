import { existsSync, readFileSync, statSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { launch, probeText, readLog, typeInto } from './launch'

test("Claude Code gets Blueprint's hooks in a private settings file, removed on quit", async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')

  const args: string[] = JSON.parse(readLog(log, 'claude.start').trim().split('\n')[0] ?? '{}').args
  const at = args.indexOf('--settings')
  expect(at).toBeGreaterThan(-1)
  const file = args[at + 1] ?? ''
  expect(statSync(file).mode & 0o777).toBe(0o600)

  const settings: { hooks: Record<string, { hooks: { url: string }[] }[]> } = JSON.parse(
    readFileSync(file, 'utf8'),
  )
  expect(Object.keys(settings.hooks).toSorted()).toEqual([
    'Notification',
    'PermissionRequest',
    'PostToolUse',
    'Stop',
    'UserPromptSubmit',
  ])
  for (const matchers of Object.values(settings.hooks)) {
    expect(matchers[0]?.hooks[0]?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook$/)
  }

  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toBe('UserPromptSubmit 204\n')

  await app.close()
  expect(existsSync(file)).toBe(false)
})
