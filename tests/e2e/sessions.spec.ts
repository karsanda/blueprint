import { type ElectronApplication, expect, type Locator, type Page, test } from '@playwright/test'
import { dropTab, gitFolder, launch, probeText, readLog, typeInto } from './launch'

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

test('a closed session number is not given to the next session', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await openSession(page, 'Claude', 'claude-2')
  await closeAction(page, 'Claude 2').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await openSession(page, 'Claude', 'claude-3')
  await expect(tab(page, 'Claude 3')).toBeVisible()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await app.close()
})

test('a session closed while it is starting leaves no program behind', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await groupWith(page, 'Claude').getByRole('button', { name: 'New Claude session' }).click()
  await closeAction(page, 'Claude 2').click()
  await page.waitForTimeout(1000)
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  const started = readLog(log, 'claude2.start')
  if (started !== '') expect(alive(pidOf(log, 'claude2.start'))).toBe(false)
  await expect.poll(() => page.title()).toBe('Blueprint')
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

const header = (page: Page) => page.locator('[data-tab="changes"] .bp-changes-session')
const row = (page: Page, path: string) => page.locator(`[data-tab="changes"] [data-path="${path}"]`)

async function twoSessions(): Promise<Awaited<ReturnType<typeof launch>>> {
  const run = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(run.page, 'claude-1')).toContain('claude ready')
  await openSession(run.page, 'Claude', 'claude-2')
  await expect.poll(() => probeText(run.page, 'claude-2')).toContain('claude ready')
  await expect(run.page.locator('[data-tab="claude-2"]')).toHaveAttribute('data-status', 'idle')
  return run
}

async function focusClaude(page: Page, title: string): Promise<void> {
  const target = page.locator('.dv-tab', { hasText: new RegExp(`^\\s*⚠?\\s*${title}\\s*$`) })
  await target.click()
  await expect(target).toHaveClass(/dv-active-tab/)
}

/** Brings a session's tab forward, then types into it. */
async function typeIn(page: Page, log: string, title: string, tabId: string, text: string): Promise<void> {
  const hooks = tabId === 'claude-1' ? 'claude.hooks' : `claude${tabId.slice(7)}.hooks`
  const stops = () =>
    readLog(log, hooks)
      .split('\n')
      .filter((l) => l.startsWith('Stop')).length
  const before = stops()
  await focusClaude(page, title)
  await expect(page.locator(`[data-tab="${tabId}"]`)).toBeVisible()
  await typeInto(page, tabId, text)
  await expect.poll(stops).toBe(before + 1)
}

test('each file is tagged with its own session', async () => {
  const { app, page, log } = await twoSessions()
  await typeIn(page, log, 'Claude', 'claude-1', 'pws')
  await typeIn(page, log, 'Claude 2', 'claude-2', 'pws')
  await focusClaude(page, 'Claude')
  await page.getByRole('button', { name: 'This session' }).click()
  await expect(row(page, 'claude-1.txt').getByRole('img', { name: 'Claude', exact: true })).toBeVisible()
  await expect(row(page, 'claude2-1.txt').getByRole('img', { name: 'Claude 2', exact: true })).toBeVisible()
  await app.close()
})

test('both tabs warn when two sessions change the same file', async () => {
  const { app, page, log } = await twoSessions()
  await typeIn(page, log, 'Claude', 'claude-1', 'pes')
  await typeIn(page, log, 'Claude 2', 'claude-2', 'pes')
  const mark1 = tab(page, 'Claude 2').getByRole('img', { name: 'Overlap with Claude', exact: true })
  const mark2 = page.locator('.dv-tab').getByRole('img', { name: 'Overlap with Claude 2', exact: true })
  await expect(mark1).toHaveAttribute('title', /notes\.txt/)
  await expect(mark2).toHaveAttribute('title', /notes\.txt/)
  await app.close()
})

test('the Changes pane follows the session focused last', async () => {
  const { app, page } = await twoSessions()
  await focusClaude(page, 'Claude')
  await expect(header(page)).toHaveText('Claude')
  await focusClaude(page, 'Claude 2')
  await expect(header(page)).toHaveText('Claude 2')
  await app.close()
})

test('closing the shown session moves the Changes pane to another', async () => {
  const { app, page } = await twoSessions()
  await focusClaude(page, 'Claude 2')
  await expect(header(page)).toHaveText('Claude 2')
  await closeAction(page, 'Claude 2').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expect(header(page)).toHaveText('Claude')
  await app.close()
})

test("a closed session's Changes keep its name", async () => {
  const { app, page, log } = await twoSessions()
  await typeIn(page, log, 'Claude 2', 'claude-2', 'pws')
  await typeIn(page, log, 'Claude', 'claude-1', 'pes')
  await typeIn(page, log, 'Claude 2', 'claude-2', 'pes')
  await expect(tab(page, 'Claude 2').getByRole('img', { name: /^Overlap/ })).toBeVisible()
  await focusClaude(page, 'Claude 2')
  await closeAction(page, 'Claude 2').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await page.getByRole('button', { name: 'This session' }).click()
  await expect(row(page, 'claude2-1.txt').getByRole('img', { name: 'Claude 2', exact: true })).toBeVisible()
  await expect(page.locator('.dv-tab').getByRole('img', { name: /^Overlap/ })).toHaveCount(0)
  await app.close()
})

async function rename(page: Page, from: string, to: string): Promise<void> {
  await tab(page, from).locator('.dv-default-tab-content, .bp-tab-name').first().dblclick()
  const field = page.getByRole('textbox', { name: 'Session name' })
  await expect(field).toBeFocused()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(to)
  await page.keyboard.press('Enter')
  await expect(field).toHaveCount(0)
}

test("a renamed session's Change shows the new name", async () => {
  const { app, page } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await rename(page, 'Claude', 'api retries')
  await expect(tab(page, 'api retries')).toBeVisible()
  await typeInto(page, 'claude-1', 'pw')
  await expect(row(page, 'claude-1.txt').getByRole('img', { name: 'api retries', exact: true })).toBeVisible()
  await expect(header(page)).toHaveText('api retries')
  await app.close()
})

test('the new name shows in the window title', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await stubUnfocused(app)
  await rename(page, 'Claude', 'api retries')
  await typeInto(page, 'claude-1', 'p?')
  await expect.poll(() => page.title()).toBe('Needs you: api retries — Blueprint')
  await rename(page, 'api retries', 'docs')
  await expect.poll(() => page.title()).toBe('Needs you: docs — Blueprint')
  await app.close()
})

test('Escape and an empty name keep the old name', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  const field = page.getByRole('textbox', { name: 'Session name' })
  await tab(page, 'Claude').locator('.dv-default-tab-content, .bp-tab-name').first().dblclick()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('nope')
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(tab(page, 'Claude')).toBeVisible()
  await expect(tab(page, 'nope')).toHaveCount(0)

  await tab(page, 'Claude').locator('.dv-default-tab-content, .bp-tab-name').first().dblclick()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  await expect(field).toHaveCount(0)
  await expect(tab(page, 'Claude')).toBeVisible()
  await expect(header(page)).toHaveText('Claude')
  await app.close()
})

test('a renamed session keeps its name after reopening', async () => {
  const first = await launch()
  await expect.poll(() => probeText(first.page, 'claude-1')).toContain('claude ready')
  await openSession(first.page, 'Claude', 'claude-2')
  await rename(first.page, 'Claude 2', 'docs')
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(tab(second.page, 'docs')).toBeVisible()
    await expect.poll(() => probeText(second.page, 'claude-2')).toContain('claude ready')
  } finally {
    await second.app.close()
  }
})

test('closing the first Claude tab keeps the saved layout', async () => {
  const first = await launch()
  await expect.poll(() => probeText(first.page, 'claude-1')).toContain('claude ready')
  await openSession(first.page, 'Claude', 'claude-2')
  await rename(first.page, 'Claude 2', 'docs')
  await closeAction(first.page, 'Claude').click()
  await expect(tab(first.page, 'Claude')).toHaveCount(0)
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(tab(second.page, 'docs')).toBeVisible()
    await expect(second.page.locator('.dv-tab', { hasText: /^\s*⚠?\s*Claude\s*$/ })).toHaveCount(0)
    await expect(tab(second.page, 'Changes')).toBeVisible()
    await expect(tab(second.page, 'Difference')).toBeVisible()
    await expect.poll(() => probeText(second.page, 'claude-2')).toContain('claude ready')
  } finally {
    await second.app.close()
  }
})

/** Waits until the keyboard is in the tab's terminal, as the Developer sees the cursor there. */
async function expectKeyboardIn(page: Page, tabId: string): Promise<void> {
  await expect(page.locator(`[data-tab="${tabId}"] .xterm-helper-textarea`)).toBeFocused()
}

function promptsOf(log: string, hooks: string): number {
  return readLog(log, hooks)
    .split('\n')
    .filter((l) => l.startsWith('UserPromptSubmit')).length
}

test("clicking a session's tab puts the keyboard in its terminal", async () => {
  const { app, page, log } = await twoSessions()
  await clickTab(page, 'Claude')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(1)
  await clickTab(page, 'Claude 2')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude2.hooks')).toBe(1)
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(1)
  await app.close()
})

/** Clicks a session's tab as a Developer does, holding the button briefly, and returns at once to type. */
async function clickTab(page: Page, title: string): Promise<void> {
  await page.locator('.dv-tab', { hasText: new RegExp(`^\\s*⚠?\\s*${title}\\s*$`) }).click({ delay: 80 })
}

test("clicking a session's tab in another pane puts the keyboard in its terminal", async () => {
  const { app, page, log } = await twoSessions()
  const content = await groupWith(page, 'Claude').locator('.dv-content-container').boundingBox()
  if (!content) throw new Error('No Claude pane')
  await dropTab(page, 'Claude 2', content.x + content.width * 0.95, content.y + content.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(5)
  await clickTab(page, 'Claude')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(1)
  await clickTab(page, 'Claude 2')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude2.hooks')).toBe(1)
  await clickTab(page, 'Claude')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(2)
  await tab(page, 'Shell').click()
  await clickTab(page, 'Claude')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(3)
  await app.close()
})

test("clicking a terminal's already-active tab puts the keyboard in its terminal", async () => {
  const { app, page, log } = await twoSessions()
  await clickTab(page, 'Claude')
  await expectKeyboardIn(page, 'claude-1')
  await clickTab(page, 'Claude')

  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(1)
  await app.close()
})

test("a fast double-click on an inactive session's tab opens its name field and keeps it", async () => {
  const { app, page } = await twoSessions()
  await page
    .locator('.dv-tab', { hasText: /^\s*⚠?\s*Claude\s*$/ })
    .locator('.dv-default-tab-content')
    .dblclick()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('fast')
  await page.keyboard.press('Enter')
  await expect(tab(page, 'fast')).toBeVisible()
  await app.close()
})

test('Escape and Enter during IME composition leave the name field open', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await tab(page, 'Claude').locator('.dv-default-tab-content').dblclick()
  const field = page.getByRole('textbox', { name: 'Session name' })
  await expect(field).toBeFocused()
  for (const key of ['Escape', 'Enter']) {
    await field.evaluate((el, k) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, isComposing: true, bubbles: true }))
    }, key)
    await expect(field).toBeFocused()
  }
  await app.close()
})

test('closing a session puts the keyboard in the tab that takes its place', async () => {
  const { app, page, log } = await twoSessions()
  await closeAction(page, 'Claude 2').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expectKeyboardIn(page, 'claude-1')
  await page.keyboard.type('p')
  await expect.poll(() => promptsOf(log, 'claude.hooks')).toBe(1)
  await app.close()
})

test("a closed session's notification is closed", async () => {
  const { app, page } = await twoSessions()
  await stubUnfocused(app)
  await app.evaluate(({ Notification }) => {
    globalThis.closedNotifications = 0
    Notification.prototype.close = function () {
      globalThis.closedNotifications = (globalThis.closedNotifications ?? 0) + 1
    }
  })
  await typeInto(page, 'claude-2', 'p?')
  await expect.poll(() => app.evaluate(() => globalThis.shown?.length)).toBe(1)
  await focusClaude(page, 'Claude 2')
  await closeAction(page, 'Claude 2').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close session' }).click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)
  await expect.poll(() => app.evaluate(() => globalThis.closedNotifications)).toBe(1)
  await app.close()
})
