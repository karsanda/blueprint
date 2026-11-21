import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, probeCall, probeText, readLog, typeInto } from './launch'

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
    'PreToolUse',
    'Stop',
    'UserPromptSubmit',
  ])
  for (const matchers of Object.values(settings.hooks)) {
    expect(matchers[0]?.hooks[0]?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook\/[A-Za-z0-9-]+$/)
  }

  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toBe('UserPromptSubmit 204\n')

  await app.close()
  expect(existsSync(file)).toBe(false)
  expect(existsSync(dirname(file))).toBe(false)
})

test('a Claude session starts idle', async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await expect(pane).toContainText('Idle')
  await expect(page.locator('[data-tab="shell-1"]')).not.toHaveAttribute('data-status', /.*/)
  await app.close()
})

test('a session that needs the Developer shows as working when the Developer answers', async () => {
  const { app, page, log } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await expect(pane).toContainText('Needs you')
  await typeInto(page, 'claude-1', '1')
  await expect(pane).toHaveAttribute('data-status', 'working')
  await expect(pane).toContainText('Working')
  expect(readLog(log, 'claude.hooks')).not.toContain('PostToolUse')
  await app.close()
})

test('a working session shows as idle when Claude Code finishes its turn', async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p')
  await expect(pane).toHaveAttribute('data-status', 'working')
  await typeInto(page, 'claude-1', 's')
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await app.close()
})

test('a session mid-turn shows as idle when the Developer refuses or stops Claude Code', async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await typeInto(page, 'claude-1', 'x')
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await typeInto(page, 'claude-1', 'p')
  await expect(pane).toHaveAttribute('data-status', 'working')
  await typeInto(page, 'claude-1', 'x')
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await app.close()
})

test('clicking into a pane that shows Needs you keeps the mark', async () => {
  const { app, page, log } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'r')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await probeCall(page, 'focus', 'shell-1')
  await probeCall(page, 'focus', 'claude-1')
  await expect.poll(() => readLog(log, 'claude.input')).toContain('\x1b[I')
  await page.waitForTimeout(300)
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await app.close()
})

test('a restarted session starts idle', async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await typeInto(page, 'claude-1', '~')
  await expect(pane).toContainText('Claude Code exited (code 3).')
  await expect(pane).not.toHaveAttribute('data-status', /.*/)
  await pane.getByRole('button', { name: 'Restart' }).click()
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await app.close()
})

test('a working session shows Needs you on its tab, pane and title bar when Claude Code asks permission', async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  const tab = page.locator('.dv-tab', { hasText: 'Claude' })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect(page.locator('.dv-tab', { hasText: 'Shell' }).getByRole('img')).toHaveCount(0)
  await typeInto(page, 'claude-1', 'p')
  await expect(tab.getByRole('img', { name: 'Working' })).toBeVisible()
  await typeInto(page, 'claude-1', '?')
  await expect(tab.getByRole('img', { name: 'Needs you' })).toBeVisible()
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await expect(page).toHaveTitle('Needs you: Claude — Blueprint')
  const native = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())
  await expect.poll(native).toBe('Needs you: Claude — Blueprint')
  await typeInto(page, 'claude-1', 's')
  await expect(page).toHaveTitle('Blueprint')
  await app.close()
})

test('a session keeps its status after /clear', async () => {
  const { app, page, log } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p')
  await expect(pane).toHaveAttribute('data-status', 'working')
  await typeInto(page, 'claude-1', 'c')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('clear\n')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await typeInto(page, 'claude-1', 'x')
  await expect(pane).toHaveAttribute('data-status', 'idle')
  await app.close()
})

test("moving through a prompt's options keeps Needs you", async () => {
  const { app, page } = await launch()
  const pane = page.locator('[data-tab="claude-1"]')
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p?')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  await typeInto(page, 'claude-1', '1')
  await expect(pane).toHaveAttribute('data-status', 'working')
  await app.close()
})
