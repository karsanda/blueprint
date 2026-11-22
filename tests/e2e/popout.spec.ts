import { type ElectronApplication, expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeText, readLog } from './launch'

/** A tab by its exact title: `Shell` is also part of `Shell 2`. */
function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: new RegExp(`^\\s*${title}\\s*$`) })
}

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: tab(page, title) })
}

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('ready')
}

/** Pops out the pane holding `title` from its Pane menu, and gives back the new window. */
async function popOut(app: ElectronApplication, page: Page, title: string): Promise<Page> {
  const opened = app.waitForEvent('window')
  await groupWith(page, title).getByRole('button', { name: 'Pane menu' }).click()
  await page.getByRole('menuitem', { name: 'Pop out', exact: true }).click()
  const pop = await opened
  await pop.waitForLoadState('domcontentloaded')
  await expect(pop.locator('.dv-tab', { hasText: title }).first()).toBeVisible()
  return pop
}

/** Closes the pop-out windows from main, as the Developer closing them would. */
async function closePopouts(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      if (w.webContents.getURL().endsWith('popout.html')) w.close()
  })
}

test('Pop out moves a pane into its own window, and closing it brings it back', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await expect(pop.locator('[data-tab="shell-1"] .xterm')).toHaveCount(1)
  await expect(page.locator('[data-tab="shell-1"]')).toHaveCount(0)
  await pop.locator('[data-tab="shell-1"] .xterm-helper-textarea').focus()
  await pop.keyboard.type('x')
  await expect.poll(() => readLog(log, 'fake-shell.input')).toContain('x')
  await closePopouts(app)
  await expect(page.locator('[data-tab="shell-1"]')).toHaveCount(1)
  await expect.poll(() => app.windows().length).toBe(1)
  await app.close()
})

test('Dock brings a popped-out pane back', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await groupWith(pop, 'Shell').getByRole('button', { name: 'Pane menu' }).click()
  await pop.getByRole('menuitem', { name: 'Dock', exact: true }).click()
  await expect(page.locator('[data-tab="shell-1"]')).toHaveCount(1)
  await expect.poll(() => app.windows().length).toBe(1)
  await app.close()
})

test('keys work in a pop-out window', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await pop.locator('[data-tab="shell-1"] .xterm-helper-textarea').focus()
  await pop.keyboard.press('Control+Shift+KeyT')
  await expect(pop.locator('[data-tab="shell-2"]')).toHaveCount(1)
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  await app.close()
})

test('a pop-out window shows the same title', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Claude')
  await pop.locator('[data-tab="claude-1"] .xterm-helper-textarea').focus()
  await pop.keyboard.type('?')
  await expect.poll(() => page.title()).toContain('Needs you')
  await expect.poll(() => pop.title()).toContain('Needs you')
  await app.close()
})

test('a notification click raises the pop-out window holding the session', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Claude')
  await pop.evaluate(() => {
    window.focusCalls = 0
    const focus = window.focus.bind(window)
    window.focus = () => {
      window.focusCalls = (window.focusCalls ?? 0) + 1
      focus()
    }
  })
  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().endsWith('popout.html'))
    main?.webContents.send('status:focus', 'claude-1')
  })
  await expect.poll(() => pop.evaluate(() => window.focusCalls)).toBeGreaterThan(0)
  await app.close()
})

test('closing a busy shell in a pop-out asks in that window', async () => {
  const { app, page } = await launch({ shell: '/bin/sh' })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await groupWith(page, 'Shell').getByRole('button', { name: 'New shell' }).click()
  await expect.poll(() => probeText(page, 'shell-2')).toContain('$')
  await page.locator('[data-tab="shell-2"] .xterm-helper-textarea').focus()
  await page.keyboard.type('sleep 3072')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.blueprint.foregroundProgram('shell-2'))).toBe('sleep')
  const pop = await popOut(app, page, 'Shell 2')
  await tab(pop, 'Shell 2').locator('.dv-default-tab-action').click()
  await expect(pop.getByRole('dialog').getByText('Close Shell 2?')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await pop.getByRole('dialog').getByRole('button', { name: 'Close shell' }).click()
  await expect(tab(pop, 'Shell 2')).toHaveCount(0)
  await app.close()
})

test('a preset closes pop-out windows', async () => {
  const { app, page } = await launch()
  await ready(page)
  await popOut(app, page, 'Shell')
  await page.getByRole('button', { name: 'Layout' }).click()
  await page.getByRole('menuitem', { name: /^Agent and review/ }).click()
  await expect.poll(() => app.windows().length).toBe(1)
  await expect(page.locator('[data-tab="shell-1"]')).toHaveCount(1)
  await expect(page.locator('.dv-groupview')).toHaveCount(4)
  await app.close()
})

test('a pop-out window comes back after reopening', async () => {
  const first = await launch()
  await ready(first.page)
  await popOut(first.app, first.page, 'Shell')
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect.poll(() => second.app.windows().length).toBe(2)
    const pop = second.app.windows().find((w) => w.url().endsWith('popout.html'))
    expect(pop).toBeDefined()
    await expect(pop!.locator('[data-tab="shell-1"]')).toHaveCount(1)
    await expect.poll(() => probeText(second.page, 'shell-1')).toContain('fake-shell ready')
  } finally {
    await second.app.close()
  }
})

test('a pop-out window refuses to navigate or open windows', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await app.evaluate(({ shell }) => {
    globalThis.openedUrls = []
    shell.openExternal = async (url: string) => {
      globalThis.openedUrls?.push(url)
    }
  })
  const url = pop.url()
  expect(url).toMatch(/^blueprint:\/\/app\/popout\.html$/)
  await pop.evaluate(() => {
    location.href = 'https://example.com/'
  })
  await pop.waitForTimeout(500)
  expect(pop.url()).toBe(url)
  expect(await pop.evaluate(() => window.open('https://example.com/docs') === null)).toBe(true)
  await pop.waitForTimeout(300)
  expect(app.windows().length).toBe(2)
  expect(await app.evaluate(() => globalThis.openedUrls)).toEqual(['https://example.com/docs'])
  await app.close()
})
