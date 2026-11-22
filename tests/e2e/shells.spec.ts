import { expect, type Locator, type Page, test } from '@playwright/test'
import { dropTab, launch, probeText, readLog } from './launch'

/** A tab by its exact title: `Shell` is also part of `Shell 2`. */
function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: new RegExp(`^\\s*${title}\\s*$`) })
}

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: tab(page, title) })
}

function lines(text: string): string[] {
  return text.trim().split('\n').filter(Boolean)
}

function startsOf(log: string): { cwd: string; pid: number }[] {
  return lines(readLog(log, 'fake-shell.start')).map((l) => JSON.parse(l))
}

async function openShell(page: Page, group: string, expectedId: string): Promise<void> {
  await groupWith(page, group).getByRole('button', { name: 'New shell' }).click()
  await expect.poll(() => probeText(page, expectedId)).toContain('ready')
}

async function rename(page: Page, from: string, to: string): Promise<void> {
  await tab(page, from).locator('.dv-default-tab-content, .bp-tab-name').first().dblclick()
  const field = page.getByRole('textbox', { name: 'Shell name' })
  await expect(field).toBeFocused()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(to)
  await page.keyboard.press('Enter')
  await expect(field).toHaveCount(0)
}

test('opening another shell opens it in a new tab', async () => {
  const { app, page, log, folder } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  const shellGroup = groupWith(page, 'Shell')
  await shellGroup.getByRole('button', { name: 'New shell' }).click()
  await expect(shellGroup.locator('.dv-tab.dv-active-tab')).toHaveText('Shell 2')
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  await expect.poll(() => startsOf(log).length).toBe(2)
  expect(startsOf(log)[1]?.cwd).toBe(folder)
  await expect(page.locator('[data-tab="shell-2"] .xterm-helper-textarea')).toBeFocused()
  await expect(groupWith(page, 'Claude').getByRole('button', { name: 'New shell' })).toHaveCount(0)
  await expect(shellGroup.getByRole('button', { name: 'New Claude session' })).toHaveCount(0)
  await app.close()
})

test('a shell dragged into the Claude pane gets both actions there', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  const target = (await groupWith(page, 'Claude').locator('.dv-content-container').boundingBox())!
  await dropTab(page, 'Shell', target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(3)
  const group = groupWith(page, 'Claude')
  await expect(group.getByRole('button', { name: 'New shell' })).toBeVisible()
  await expect(group.getByRole('button', { name: 'New Claude session' })).toBeVisible()
  await group.getByRole('button', { name: 'New shell' }).click()
  await expect(group.locator('.dv-tab', { hasText: 'Shell 2' })).toBeVisible()
  await expect.poll(() => probeText(page, 'shell-2')).toContain('fake-shell ready')
  await app.close()
})

test('a renamed shell keeps its name after reopening', async () => {
  const first = await launch()
  await expect.poll(() => probeText(first.page, 'shell-1')).toContain('fake-shell ready')
  await openShell(first.page, 'Shell', 'shell-2')
  await rename(first.page, 'Shell 2', 'dev server')
  await expect(tab(first.page, 'dev server')).toBeVisible()
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(tab(second.page, 'Shell')).toBeVisible()
    await expect(tab(second.page, 'dev server')).toBeVisible()
    await expect.poll(() => probeText(second.page, 'shell-2')).toContain('fake-shell ready')
    await expect.poll(() => startsOf(second.log).length).toBe(2)
    expect(startsOf(second.log).map((s) => s.cwd)).toEqual([first.folder, first.folder])
  } finally {
    await second.app.close()
  }
})
