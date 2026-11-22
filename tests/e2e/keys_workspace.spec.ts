import { expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeCall, probeText, readLog } from './launch'

/** A tab by its exact title: `Shell` is also part of `Shell 2`. */
function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: new RegExp(`^\\s*${title}\\s*$`) })
}

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: tab(page, title) })
}

const textarea = (page: Page, tabId: string) => page.locator(`[data-tab="${tabId}"] .xterm-helper-textarea`)

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
}

/** Puts the keyboard in a terminal, as clicking into it would. */
async function focusTerminal(page: Page, tabId: string): Promise<void> {
  await probeCall(page, 'focus', tabId)
  await expect(textarea(page, tabId)).toBeFocused()
}

test('Ctrl+Shift+H, J, K and L move the keyboard between panes', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'claude-1')
  await page.keyboard.press('Control+Shift+KeyL')
  await expect(groupWith(page, 'Difference')).toHaveClass(/dv-active-group/)
  await page.keyboard.press('Control+Shift+KeyH')
  await expect(textarea(page, 'claude-1')).toBeFocused()
  await page.keyboard.press('Control+Shift+KeyH')
  await expect(groupWith(page, 'Changes')).toHaveClass(/dv-active-group/)
  await page.keyboard.press('Control+Shift+KeyH')
  await expect(groupWith(page, 'Changes')).toHaveClass(/dv-active-group/)
  await focusTerminal(page, 'claude-1')
  await page.keyboard.press('Control+Shift+KeyJ')
  await expect(textarea(page, 'shell-1')).toBeFocused()
  // Claude and Difference both sit above the Shell pane; the nearest one takes the keyboard.
  await page.keyboard.press('Control+Shift+KeyK')
  await expect(groupWith(page, 'Shell')).toHaveClass(/dv-inactive-group/)
  await app.close()
})

test('Ctrl+Shift+Alt+L moves the tab to the pane on the right', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'claude-1')
  await page.keyboard.press('Control+Shift+Alt+KeyL')
  await expect(page.locator('.dv-groupview')).toHaveCount(3)
  const group = groupWith(page, 'Difference')
  await expect(group.locator('.dv-tab.dv-active-tab')).toHaveText('Claude')
  await expect(textarea(page, 'claude-1')).toBeFocused()
  await app.close()
})

test('Ctrl+Shift+T and N open a shell and a Claude session', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'claude-1')
  await page.keyboard.press('Control+Shift+KeyT')
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  await expect(groupWith(page, 'Shell').locator('.dv-tab', { hasText: 'Shell 2' })).toBeVisible()
  await expect(textarea(page, 'shell-2')).toBeFocused()
  await page.keyboard.press('Control+Shift+KeyN')
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  await expect(groupWith(page, 'Claude').locator('.dv-tab', { hasText: 'Claude 2' })).toBeVisible()
  await app.close()
})

test('Ctrl+Tab and Ctrl+Shift+Tab switch tabs, wrapping', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'shell-1')
  await page.keyboard.press('Control+Shift+KeyT')
  await expect(textarea(page, 'shell-2')).toBeFocused()
  await page.keyboard.press('Control+Tab')
  await expect(tab(page, 'Shell')).toHaveClass(/dv-active-tab/)
  await expect(textarea(page, 'shell-1')).toBeFocused()
  await page.keyboard.press('Control+Shift+Tab')
  await expect(tab(page, 'Shell 2')).toHaveClass(/dv-active-tab/)
  await expect(textarea(page, 'shell-2')).toBeFocused()
  await app.close()
})

test('Ctrl+Shift+Z zooms the pane and back', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'claude-1')
  await page.keyboard.press('Control+Shift+KeyZ')
  await expect(groupWith(page, 'Claude').getByRole('button', { name: 'Zoom out' })).toBeVisible()
  await page.keyboard.press('Control+Shift+KeyZ')
  await expect(groupWith(page, 'Claude').getByRole('button', { name: 'Zoom pane' })).toBeVisible()
  await app.close()
})

test('keys the programs use still reach them', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  await focusTerminal(page, 'shell-1')
  for (const k of ['Control+ArrowLeft', 'Control+Shift+ArrowLeft', 'Alt+KeyC', 'Control+KeyH']) {
    await page.keyboard.press(k)
  }
  await page.keyboard.type('.')
  await expect.poll(() => readLog(log, 'fake-shell.input')).toContain('.')
  // Ctrl+Shift+H is Blueprint's: it moves the keyboard to the pane on the left and sends nothing.
  await page.keyboard.press('Control+Shift+KeyH')
  await expect(textarea(page, 'shell-1')).not.toBeFocused()
  const input = readLog(log, 'fake-shell.input')
  expect(input).toContain('\x1b[1;5D')
  expect(input).toContain('\x1b[1;6D')
  expect(input).toContain('\x1bc')
  expect(input.split('\x08')).toHaveLength(2)
  await app.close()
})

test('keys typed in the rename field stay in it', async () => {
  const { app, page } = await launch()
  await ready(page)
  await tab(page, 'Claude').locator('.dv-default-tab-content').dblclick()
  const field = page.getByRole('textbox', { name: 'Session name' })
  await expect(field).toBeFocused()
  await page.keyboard.press('Control+Shift+KeyL')
  await expect(field).toBeFocused()
  // While the field is open the tab shows no title, so find the pane by the field.
  await expect(page.locator('.dv-groupview', { has: field })).toHaveClass(/dv-active-group/)
  await app.close()
})

test('workspace keys do nothing while a menu is open', async () => {
  const { app, page } = await launch()
  await ready(page)
  await focusTerminal(page, 'claude-1')
  await groupWith(page, 'Claude').getByRole('button', { name: 'Pane menu' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Control+Shift+KeyZ')
  await page.waitForTimeout(300)
  // A menu hides the rest of the window from roles, so look the zoom button up by its label.
  await expect(page.locator('[aria-label="Zoom out"]')).toHaveCount(0)
  await app.close()
})

test('workspace keys do nothing while the close question is open', async () => {
  const { app, page } = await launch({ shell: '/bin/sh' })
  try {
    await groupWith(page, 'Shell').getByRole('button', { name: 'New shell' }).click()
    await expect.poll(() => probeText(page, 'shell-2')).toContain('$')
    await focusTerminal(page, 'shell-2')
    await page.keyboard.type('sleep 3072')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.blueprint.foregroundProgram('shell-2'))).toBe('sleep')
    await tab(page, 'Shell 2').hover()
    await tab(page, 'Shell 2').locator('.dv-default-tab-action').click()
    await expect(page.getByRole('dialog').getByText('Close Shell 2?')).toBeVisible()
    await page.keyboard.press('Control+Tab')
    await page.waitForTimeout(300)
    await expect(tab(page, 'Shell 2')).toHaveClass(/dv-active-tab/)
    await expect(page.getByRole('dialog')).toBeVisible()
  } finally {
    await app.close()
  }
})
