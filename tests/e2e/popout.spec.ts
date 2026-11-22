import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ElectronApplication, expect, type Locator, type Page, test } from '@playwright/test'
import { gitFolder, launch, probeRenders, probeText, readLog, typeInto } from './launch'

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

/** Puts the keyboard in a tab's terminal in `win`; a window that has just opened may take a moment to accept it. */
async function focusTerminal(win: Page, tabId: string): Promise<void> {
  const textarea = win.locator(`[data-tab="${tabId}"] .xterm-helper-textarea`)
  await expect(async () => {
    await textarea.focus()
    await expect(textarea).toBeFocused({ timeout: 300 })
  }).toPass()
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
  await focusTerminal(pop, 'shell-1')
  await pop.keyboard.type('x')
  await expect.poll(() => readLog(log, 'fake-shell.input')).toContain('x')
  // It draws there too: the fake shell answers `f` with a full-screen page.
  const before = await probeRenders(page, 'shell-1')
  await pop.keyboard.type('f')
  await expect.poll(() => probeRenders(page, 'shell-1')).toBeGreaterThan(before)
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
  await focusTerminal(pop, 'shell-1')
  await pop.keyboard.press('Control+Shift+KeyT')
  await expect(pop.locator('[data-tab="shell-2"]')).toHaveCount(1)
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  await app.close()
})

test('a pop-out window shows the same title', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Claude')
  await focusTerminal(pop, 'claude-1')
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

test('no notification while a pop-out window is in front', async () => {
  const { app, page } = await launch()
  await ready(page)
  await popOut(app, page, 'Shell')
  await app.evaluate(({ BrowserWindow, Notification }) => {
    const windows = BrowserWindow.getAllWindows()
    const pop = windows.find((w) => w.webContents.getURL().endsWith('popout.html'))
    if (!pop) throw new Error('No pop-out window')
    // Electron finds the focused window by asking each one.
    for (const w of windows) w.isFocused = () => w === pop
    globalThis.shown = []
    Notification.isSupported = () => true
    Notification.prototype.show = function (this: Electron.Notification) {
      globalThis.shown?.push(this)
    }
  })
  await typeInto(page, 'claude-1', 'p?')
  await expect(page.locator('[data-tab="claude-1"]')).toHaveAttribute('data-status', 'needs-you')
  await page.waitForTimeout(300)
  expect(await app.evaluate(() => globalThis.shown?.length)).toBe(0)
  await app.close()
})

test('focusing a pop-out window refreshes the review', async () => {
  const folder = gitFolder()
  const { app, page, log } = await launch({ folder })
  await ready(page)
  await popOut(app, page, 'Shell')
  // With the Changes pane taken as hidden, only a hook or a window coming to the front refreshes the review.
  await page.evaluate(() => {
    window.reviewStates = []
    window.blueprint.onReviewUpdate((state) => window.reviewStates?.push(state))
    window.blueprint.setReviewView({ range: 'turn', visible: false, tabId: null })
  })
  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('UserPromptSubmit 204')
  writeFileSync(join(folder, 'README.md'), 'changed while the pop-out is in front\n')
  const listed = () =>
    page.evaluate(() =>
      (window.reviewStates ?? []).flatMap((s) => (s.kind === 'changes' ? s.changes.map((c) => c.path) : [])),
    )
  await page.waitForTimeout(500)
  expect(await listed()).not.toContain('README.md')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('popout.html'))
      ?.emit('focus')
  })
  await expect.poll(listed).toContain('README.md')
  await app.close()
})

test('closing a busy shell in a pop-out asks in that window', async () => {
  const { app, page } = await launch({ shell: '/bin/sh' })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await groupWith(page, 'Shell').getByRole('button', { name: 'New shell' }).click()
  await expect.poll(() => probeText(page, 'shell-2')).toContain('$')
  await focusTerminal(page, 'shell-2')
  await page.keyboard.type('sleep 3072')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.blueprint.foregroundProgram('shell-2'))).toBe('sleep')
  const pop = await popOut(app, page, 'Shell 2')
  await tab(pop, 'Shell 2').hover()
  await tab(pop, 'Shell 2').locator('.dv-default-tab-action').click()
  await expect(pop.getByRole('dialog').getByText('Close Shell 2?')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await pop.getByRole('dialog').getByRole('button', { name: 'Close shell' }).click()
  await expect(tab(pop, 'Shell 2')).toHaveCount(0)
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

test('a pop-out page runs no inline script', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await pop.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.injected = true'
    document.body.append(script)
  })
  expect(await pop.evaluate(() => window.injected)).toBeUndefined()
  await app.close()
})

test("a pop-out page cannot reach the main window's API", async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  // A pop-out page gets no API of its own; its only way to one would be the window that opened it.
  await pop.evaluate(() => {
    const opener: unknown = window.opener
    if (opener !== null && typeof opener === 'object' && 'blueprint' in opener) {
      const api = opener.blueprint
      if (typeof api === 'object' && api !== null && 'write' in api && typeof api.write === 'function')
        api.write('shell-1', 'from-the-pop-out')
    }
  })
  await page.evaluate(() => window.blueprint.write('shell-1', 'from-the-main-window'))
  await expect.poll(() => readLog(log, 'fake-shell.input')).toContain('from-the-main-window')
  expect(readLog(log, 'fake-shell.input')).not.toContain('from-the-pop-out')
  await app.close()
})

test('a pop-out window loads its own page only once', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await pop.evaluate(() => {
    window.loadedOnce = true
  })
  // A navigation, unlike a reload, asks the guard first.
  await pop.evaluate(() => location.assign(location.href)).catch(() => undefined)
  await pop.waitForTimeout(500)
  expect(await pop.evaluate(() => window.loadedOnce)).toBe(true)
  await app.close()
})

test('closing a pop-out window removes its key listener', async () => {
  const { app, page } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  // The record goes to storage the main window shares: the pop-out's own page is gone once it closes.
  await pop.evaluate(() => {
    localStorage.setItem('removedKeyListeners', '0')
    const remove = window.removeEventListener.bind(window)
    window.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      const capture = typeof options === 'boolean' ? options : options?.capture === true
      if (type === 'keydown' && capture)
        localStorage.setItem(
          'removedKeyListeners',
          String(Number(localStorage.getItem('removedKeyListeners')) + 1),
        )
      remove(type, listener, options)
    }
  })
  await closePopouts(app)
  await expect(page.locator('[data-tab="shell-1"]')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('removedKeyListeners'))).toBe('1')
  await app.close()
})

test('a terminal opened in a pop-out still draws after the pop-out closes', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const pop = await popOut(app, page, 'Shell')
  await focusTerminal(pop, 'shell-1')
  await pop.keyboard.press('Control+Shift+KeyT')
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  const inPopout = await probeRenders(page, 'shell-2')
  await focusTerminal(pop, 'shell-2')
  await pop.keyboard.type('f')
  await expect.poll(() => probeRenders(page, 'shell-2')).toBeGreaterThan(inPopout)
  await closePopouts(app)
  await expect(page.locator('[data-tab="shell-2"]')).toHaveCount(1)
  const before = await probeRenders(page, 'shell-2')
  // The pane that comes back hands the keyboard to its active tab for a few frames; focus Shell 2 after.
  const textarea = page.locator('[data-tab="shell-2"] .xterm-helper-textarea')
  await expect(async () => {
    await textarea.focus()
    await expect(textarea).toBeFocused({ timeout: 300 })
  }).toPass()
  await page.keyboard.type('f')
  await expect.poll(() => readLog(log, 'fake-shell.input')).toContain('f')
  await expect.poll(() => probeText(page, 'shell-2')).toContain('BOTTOM')
  await expect.poll(() => probeRenders(page, 'shell-2')).toBeGreaterThan(before)
  await app.close()
})

test("direction keys skip a popped-out pane's empty place", async () => {
  const { app, page } = await launch()
  await ready(page)
  await popOut(app, page, 'Claude')
  await focusTerminal(page, 'shell-1')
  await page.keyboard.press('Control+Shift+KeyH')
  await expect(groupWith(page, 'Changes')).toHaveClass(/dv-active-group/)
  await focusTerminal(page, 'shell-1')
  await page.keyboard.press('Control+Shift+Alt+KeyH')
  await expect(groupWith(page, 'Changes').locator('.dv-tab', { hasText: 'Shell' })).toBeVisible()
  await expect(page.locator('[data-tab="shell-1"]')).toBeVisible()
  await app.close()
})

test('a tab in a pop-out can be renamed', async () => {
  const { app, page } = await launch()
  await ready(page)
  await groupWith(page, 'Shell').getByRole('button', { name: 'New shell' }).click()
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  const pop = await popOut(app, page, 'Shell 2')
  await expect(tab(pop, 'Shell 2')).toHaveClass(/dv-active-tab/)
  await tab(pop, 'Shell').locator('.dv-default-tab-content').dblclick()
  const field = pop.getByRole('textbox', { name: 'Shell name' })
  await expect(field).toBeFocused()
  await pop.waitForTimeout(700)
  await expect(field).toBeFocused()
  await pop.keyboard.press('ControlOrMeta+A')
  await pop.keyboard.type('logs')
  await pop.keyboard.press('Enter')
  await expect(tab(pop, 'logs')).toBeVisible()
  await app.close()
})
