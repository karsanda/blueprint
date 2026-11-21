import { type ElectronApplication, expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeText, readLog, typeInto } from './launch'

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: title }) })
}

function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: title })
}

async function openSession(page: Page, group: string, expectedId: string): Promise<void> {
  await groupWith(page, group).getByRole('button', { name: 'New Claude session' }).click()
  await expect.poll(() => probeText(page, expectedId)).toContain('claude')
}

function closeAction(page: Page, title: string): Locator {
  return tab(page, title).locator('.dv-default-tab-action')
}

async function stubUnfocused(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow, Notification }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No window')
    globalThis.shown = []
    win.isFocused = () => false
    Notification.isSupported = () => true
    Notification.prototype.show = function (this: Electron.Notification) {
      globalThis.shown?.push(this)
    }
  })
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function pidOf(log: string, file: string): number {
  const line = readLog(log, file).trim().split('\n')[0] ?? '{}'
  const parsed: { pid: number } = JSON.parse(line)
  return parsed.pid
}

test('a new session opens as Claude 2 in a new tab', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await openSession(page, 'Claude', 'claude-2')
  const group = groupWith(page, 'Claude 2')
  await expect(group.locator('.dv-tab', { hasText: 'Claude 2' })).toHaveClass(/dv-active-tab/)
  await expect(group.locator('.dv-tab', { hasText: 'Claude 2' })).toBeVisible()
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  await expect.poll(() => readLog(log, 'claude2.start')).not.toBe('')
  await app.close()
})

test('closing a working session asks first', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await openSession(page, 'Claude', 'claude-2')
  await expect.poll(() => readLog(log, 'claude2.start')).not.toBe('')
  const pid = pidOf(log, 'claude2.start')
  await typeInto(page, 'claude-2', 'p')
  await expect(page.locator('[data-tab="claude-2"]')).toHaveAttribute('data-status', 'working')

  await closeAction(page, 'Claude 2').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Close Claude 2?')).toBeVisible()
  await expect(dialog.getByText('It is still working.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep it' }).click()
  await expect(dialog).toBeHidden()
  await expect(tab(page, 'Claude 2')).toBeVisible()

  await closeAction(page, 'Claude 2').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close session' }).click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expect.poll(() => alive(pid)).toBe(false)
  await app.close()
})

test('an idle session closes at once', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await openSession(page, 'Claude', 'claude-2')
  await expect(page.locator('[data-tab="claude-2"]')).toHaveAttribute('data-status', 'idle')
  await closeAction(page, 'Claude 2').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await app.close()
})

test('the last Claude tab has no close action', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect(closeAction(page, 'Claude')).toHaveCount(0)
  await expect(page.locator('.dv-tab .dv-default-tab-action')).toHaveCount(0)
  await openSession(page, 'Claude', 'claude-2')
  await expect(closeAction(page, 'Claude 2')).toHaveCount(1)
  await expect(
    page.locator('.dv-tab', { hasText: /^\s*Claude\s*$/ }).locator('.dv-default-tab-action'),
  ).toHaveCount(1)
  await closeAction(page, 'Claude 2').click()
  await expect(page.locator('.dv-tab .dv-default-tab-action')).toHaveCount(0)
  await app.close()
})

test('a closed session that needed the Developer leaves the window title', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await openSession(page, 'Claude', 'claude-2')
  await stubUnfocused(app)
  await typeInto(page, 'claude-2', 'p?')
  await expect.poll(() => page.title()).toBe('Needs you: Claude 2 — Blueprint')
  await expect.poll(() => app.evaluate(() => globalThis.shown?.length)).toBe(1)

  await closeAction(page, 'Claude 2').click()
  await expect(page.getByRole('dialog').getByText('It is waiting for your answer.')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close session' }).click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expect.poll(() => page.title()).toBe('Blueprint')
  await page.waitForTimeout(300)
  expect(await app.evaluate(() => globalThis.shown?.length)).toBe(1)
  await app.close()
})

test('new sessions count on from the highest open number', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  for (const n of [2, 3, 4, 5]) await openSession(page, 'Claude', `claude-${n}`)
  await closeAction(page, 'Claude 3').click()
  await expect(tab(page, 'Claude 3')).toHaveCount(0)
  await openSession(page, 'Claude 2', 'claude-6')
  await expect(tab(page, 'Claude 6')).toBeVisible()
  await expect(tab(page, 'Claude 3')).toHaveCount(0)
  await app.close()
})

test('a saved layout with Claude 2 opens it again', async () => {
  const first = await launch()
  await expect.poll(() => probeText(first.page, 'claude-1')).toContain('claude ready')
  await openSession(first.page, 'Claude', 'claude-2')
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(tab(second.page, 'Claude 2')).toBeVisible()
    await expect.poll(() => probeText(second.page, 'claude-2')).toContain('claude ready')
  } finally {
    await second.app.close()
  }
})
