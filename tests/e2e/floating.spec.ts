import { expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeText } from './launch'

/** A tab by its exact title: `Claude` is also part of `Claude 2`. */
function tab(page: Page, title: string): Locator {
  return page.locator('.dv-tab', { hasText: new RegExp(`^\\s*${title}\\s*$`) })
}

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: tab(page, title) })
}

/** dockview's floating panes. */
const floating = (page: Page) => page.locator('.dv-resize-container')

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}

async function paneMenu(page: Page, title: string, item: string): Promise<void> {
  await groupWith(page, title).getByRole('button', { name: 'Pane menu' }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
}

test('Float lifts a pane above the layout, and Dock puts it back beside its neighbour', async () => {
  const { app, page } = await launch()
  await ready(page)
  await paneMenu(page, 'Difference', 'Float')
  await expect(floating(page)).toHaveCount(1)
  await expect(floating(page).locator('.dv-tab', { hasText: 'Difference' })).toBeVisible()
  await expect(page.locator('.dv-groupview')).toHaveCount(4)

  await paneMenu(page, 'Difference', 'Dock')
  await expect(floating(page)).toHaveCount(0)
  await expect(page.locator('.dv-groupview')).toHaveCount(4)
  const [claude, difference] = await Promise.all(['Claude', 'Difference'].map((t) => box(groupWith(page, t))))
  expect(difference.x).toBeGreaterThanOrEqual(claude.x + claude.width)
  expect(Math.abs(difference.y - claude.y)).toBeLessThanOrEqual(1)
  await app.close()
})

test('Dock with the neighbour gone docks at the right edge', async () => {
  const { app, page } = await launch()
  await ready(page)
  await groupWith(page, 'Claude').getByRole('button', { name: 'New Claude session' }).click()
  await expect.poll(() => probeText(page, 'claude-2')).toContain('claude ready')
  await paneMenu(page, 'Difference', 'Float')
  await expect(floating(page)).toHaveCount(1)
  await tab(page, 'Claude 2').hover()
  await tab(page, 'Claude 2').locator('.dv-default-tab-action').click()
  await expect(tab(page, 'Claude 2')).toHaveCount(0)

  await paneMenu(page, 'Difference', 'Dock')
  await expect(floating(page)).toHaveCount(0)
  const dock = await box(page.locator('.dv-dockview').first())
  const difference = await box(groupWith(page, 'Difference'))
  expect(Math.abs(difference.x + difference.width - (dock.x + dock.width))).toBeLessThanOrEqual(8)
  expect(Math.abs(difference.height - dock.height)).toBeLessThanOrEqual(8)
  await app.close()
})

test('a floating pane comes back after reopening', async () => {
  const first = await launch()
  await ready(first.page)
  await paneMenu(first.page, 'Difference', 'Float')
  await expect(floating(first.page)).toHaveCount(1)
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(floating(second.page)).toHaveCount(1)
    await expect(floating(second.page).locator('.dv-tab', { hasText: 'Difference' })).toBeVisible()
  } finally {
    await second.app.close()
  }
})

test('the pane menu offers Float on a docked pane and Dock on a floating one', async () => {
  const { app, page } = await launch()
  await ready(page)
  await groupWith(page, 'Difference').getByRole('button', { name: 'Pane menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Float', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dock', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Float', exact: true }).click()
  await groupWith(page, 'Difference').getByRole('button', { name: 'Pane menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Dock', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Float', exact: true })).toHaveCount(0)
  await app.close()
})
