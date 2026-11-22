import { expect, type Locator, type Page, test } from '@playwright/test'
import { dropTab, gitFolder, launch, probeText, readLog, typeInto } from './launch'

/** A tab by its exact title: `Shell` is also part of `Shell 2`. */
function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: new RegExp(`^\\s*${title}\\s*$`) })
}

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: tab(page, title) })
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}

async function tabTitles(group: Locator): Promise<string[]> {
  return (await group.locator('.dv-tab').allTextContents()).map((t) => t.trim())
}

async function pick(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Layout' }).click()
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
}

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
}

test('picking Agent and review from any layout gives its panes', async () => {
  const { app, page } = await launch()
  await ready(page)
  const target = await box(groupWith(page, 'Claude').locator('.dv-content-container'))
  await dropTab(page, 'Shell', target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(3)

  await page.getByRole('button', { name: 'Layout' }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(4)
  const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  expect(items).toEqual([
    'Agent and review Ctrl+Shift+1',
    'Two agents Ctrl+Shift+2',
    'Terminal heavy Ctrl+Shift+3',
    'Focus Ctrl+Shift+4',
  ])
  await page.getByRole('menuitem', { name: /^Agent and review/ }).click()

  await expect(page.locator('.dv-groupview')).toHaveCount(4)
  const [changes, claude, difference, shell] = await Promise.all(
    ['Changes', 'Claude', 'Difference', 'Shell'].map((t) => box(groupWith(page, t))),
  )
  expect(changes.x + changes.width).toBeLessThanOrEqual(claude.x)
  expect(difference.x).toBeGreaterThanOrEqual(claude.x + claude.width)
  expect(shell.y).toBeGreaterThanOrEqual(claude.y + claude.height)
  expect(shell.y).toBeGreaterThanOrEqual(difference.y + difference.height)
  expect(shell.x).toBeLessThanOrEqual(claude.x + 1)
  expect(shell.x + shell.width).toBeGreaterThanOrEqual(difference.x + difference.width - 1)
  await app.close()
})

test('Two agents opens a second session beside the first', async () => {
  const { app, page } = await launch()
  await ready(page)
  await pick(page, 'Two agents')
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  const [claude, claude2] = await Promise.all(['Claude', 'Claude 2'].map((t) => box(groupWith(page, t))))
  expect(claude2.x).toBeGreaterThanOrEqual(claude.x + claude.width)
  expect(Math.abs(claude2.y - claude.y)).toBeLessThanOrEqual(1)
  expect(await tabTitles(groupWith(page, 'Changes'))).toEqual(['Changes', 'Difference'])
  await app.close()
})

test('Terminal heavy opens a second shell below the first', async () => {
  const { app, page } = await launch()
  await ready(page)
  await pick(page, 'Terminal heavy')
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  const [shell, shell2, claude] = await Promise.all(
    ['Shell', 'Shell 2', 'Claude'].map((t) => box(groupWith(page, t))),
  )
  expect(shell2.y).toBeGreaterThanOrEqual(shell.y + shell.height)
  expect(shell.x).toBeGreaterThanOrEqual(claude.x + claude.width)
  expect(await tabTitles(groupWith(page, 'Claude'))).toEqual(['Claude', 'Changes', 'Difference'])
  await app.close()
})

test('Focus puts every tab in one pane with Claude active', async () => {
  const { app, page } = await launch()
  await ready(page)
  await tab(page, 'Shell').click()
  await pick(page, 'Focus')
  await expect(page.locator('.dv-groupview')).toHaveCount(1)
  await expect(page.locator('.dv-tab.dv-active-tab')).toHaveText('Claude')
  await expect(page.locator('[data-tab="claude-1"] .xterm-helper-textarea')).toBeFocused()
  await app.close()
})

test('a preset keeps each session, its name and its Changes', async () => {
  const { app, page, log } = await launch({ folder: gitFolder() })
  await ready(page)
  await groupWith(page, 'Claude').getByRole('button', { name: 'New Claude session' }).click()
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  await tab(page, 'Claude 2').locator('.dv-default-tab-content').dblclick()
  await page.getByRole('textbox', { name: 'Session name' }).fill('docs')
  await page.keyboard.press('Enter')
  await typeInto(page, 'claude-2', 'pw')
  const row = page.locator('[data-tab="changes"] [data-path="claude2-1.txt"]')
  await expect(row.getByRole('img', { name: 'docs', exact: true })).toBeVisible()

  await pick(page, 'Focus')
  await expect(page.locator('.dv-groupview')).toHaveCount(1)
  await pick(page, 'Agent and review')
  await expect(page.locator('.dv-groupview')).toHaveCount(4)

  await expect(tab(page, 'docs')).toBeVisible()
  expect(readLog(log, 'claude2.start').trim().split('\n')).toHaveLength(1)
  await expect(row.getByRole('img', { name: 'docs', exact: true })).toBeVisible()
  await app.close()
})

test('the tab with the keyboard keeps it after a preset', async () => {
  const { app, page } = await launch()
  await ready(page)
  await tab(page, 'Shell').click()
  await expect(page.locator('[data-tab="shell-1"] .xterm-helper-textarea')).toBeFocused()
  await pick(page, 'Two agents')
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  await expect(page.locator('[data-tab="shell-1"] .xterm-helper-textarea')).toBeFocused()
  await app.close()
})
