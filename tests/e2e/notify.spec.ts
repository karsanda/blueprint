import { basename } from 'node:path'
import { type ElectronApplication, expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeCall, probeText, readLog, typeInto } from './launch'

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: title }) })
}

/** Stubs what the desktop does: whether the window is in front, and what the Notification shows. */
async function stubDesktop(
  app: ElectronApplication,
  opts: { focused: boolean; supported?: boolean },
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow, Notification }, { focused, supported }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No window')
      globalThis.shown = []
      globalThis.windowCalls = []
      win.isFocused = () => focused
      const focus = win.focus.bind(win)
      win.focus = () => {
        globalThis.windowCalls?.push('focus')
        focus()
      }
      Notification.isSupported = () => supported
      Notification.prototype.show = function (this: Electron.Notification) {
        globalThis.shown?.push(this)
      }
    },
    { focused: opts.focused, supported: opts.supported ?? true },
  )
}

async function shownNotifications(app: ElectronApplication): Promise<{ title: string; body: string }[]> {
  return app.evaluate(() => (globalThis.shown ?? []).map((n) => ({ title: n.title, body: n.body })))
}

test('a desktop notification appears when a session needs the Developer and the window is not in front', async () => {
  const { app, page, folder, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await stubDesktop(app, { focused: false })
  await typeInto(page, 'claude-1', 'p?')
  await expect
    .poll(() => shownNotifications(app))
    .toEqual([
      {
        title: 'Needs you: Claude',
        body: `Claude Code is waiting for your answer in ${basename(folder)}.`,
      },
    ])
  // The backup Notification arrives from Claude Code, not from a key the Developer pressed.
  await page.evaluate("window.blueprint.write('claude-1', 'n')")
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('Notification 204')
  await page.waitForTimeout(300)
  expect(await shownNotifications(app)).toHaveLength(1)
  await app.close()
})

test('no notification while the window is in front', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await stubDesktop(app, { focused: true })
  await typeInto(page, 'claude-1', 'p?')
  await expect(page.locator('[data-tab="claude-1"]')).toHaveAttribute('data-status', 'needs-you')
  await page.waitForTimeout(300)
  expect(await shownNotifications(app)).toEqual([])
  await app.close()
})

test('the marks still show when the Operating system cannot notify', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await stubDesktop(app, { focused: false, supported: false })
  await typeInto(page, 'claude-1', 'p?')
  await expect(page.locator('[data-tab="claude-1"]')).toHaveAttribute('data-status', 'needs-you')
  await expect(groupWith(page, 'Claude').getByLabel('Needs you')).toBeVisible()
  await expect.poll(() => page.title()).toBe('Needs you: Claude — Blueprint')
  await page.waitForTimeout(300)
  expect(await shownNotifications(app)).toEqual([])
  await app.close()
})

test('clicking the notification brings the window forward with that session focused', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await stubDesktop(app, { focused: false })
  await typeInto(page, 'claude-1', 'p?')
  await expect.poll(async () => (await shownNotifications(app)).length).toBe(1)

  await probeCall(page, 'focus', 'shell-1')
  await groupWith(page, 'Shell').getByRole('button', { name: 'Zoom pane' }).click()
  await expect(page.locator('[data-tab="claude-1"]')).toBeHidden()

  await app.evaluate(() => globalThis.shown?.[0]?.emit('click'))
  await expect.poll(() => app.evaluate(() => globalThis.windowCalls)).toContain('focus')
  await expect(page.locator('[data-tab="claude-1"]')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[data-tab]')?.getAttribute('data-tab')))
    .toBe('claude-1')
  await app.close()
})
