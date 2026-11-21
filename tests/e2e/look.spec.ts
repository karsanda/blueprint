import { expect, test } from '@playwright/test'
import { gitFolder, launch, probeSize, probeText, typeInto } from './launch'

test('tabs and panes use the Blueprint look', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  const tab = page.locator('.dv-tab', { hasText: 'Claude' })
  const style = await tab.evaluate((el) => {
    const s = getComputedStyle(el)
    return { transform: s.textTransform, font: s.fontFamily }
  })
  expect(style.transform).toBe('uppercase')
  expect(style.font.startsWith('"Overpass Variable"')).toBe(true)

  await page.locator('[data-tab="claude-1"]').click()
  const active = page.locator('.dv-groupview.dv-active-group')
  expect(await active.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgb(255, 209, 102)')
  // The outer rule sits outside the pane: no ancestor may clip it.
  const room = await active.evaluate((el) => {
    const s = getComputedStyle(el)
    const n = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth)
    const r = el.getBoundingClientRect()
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (getComputedStyle(a).overflow === 'visible') continue
      const c = a.getBoundingClientRect()
      if (r.left - n < c.left || r.top - n < c.top || r.right + n > c.right || r.bottom + n > c.bottom)
        return false
    }
    return true
  })
  expect(room).toBe(true)
  const grid = await page.locator('.dv-dockview').evaluate((el) => {
    let node: Element | null = el
    while (node && !getComputedStyle(node).backgroundImage.includes('linear-gradient'))
      node = node.parentElement
    return node !== null
  })
  expect(grid).toBe(true)
  await app.close()
})

test('a Claude pane shows its column width', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  const pane = page.locator('[data-tab="claude-1"]')
  const cols = async () => (await probeSize(page, 'claude-1'))!.cols
  await expect(pane.locator('.bp-dim')).toHaveText(`${await cols()} COL`)
  await expect(page.locator('[data-tab="shell-1"] .bp-dim')).toHaveCount(0)

  const before = await cols()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 600))
  await expect.poll(cols).toBeLessThan(before)
  await expect(pane.locator('.bp-dim')).toHaveText(`${await cols()} COL`)
  await app.close()
})

test('a session that needs the Developer stands out', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p?')
  const pane = page.locator('[data-tab="claude-1"]')
  await expect(pane).toHaveAttribute('data-status', 'needs-you')
  const wait = 'rgb(255, 162, 76)'
  const light = page.locator('.dv-tab', { hasText: 'Claude' }).getByRole('img', { name: 'Needs you' })
  expect(await light.evaluate((el) => getComputedStyle(el).backgroundColor)).toContain(wait)
  expect(await pane.locator('.bp-status').evaluate((el) => getComputedStyle(el).backgroundColor)).toContain(
    wait,
  )
  expect(await pane.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(wait)
  await app.close()
})

test("Claude's changes carry a revision cloud in the agent colour", async () => {
  const { app, page } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'pe')
  await page.locator('[data-tab="changes"] [data-path="notes.txt"]').click()
  const cloud = page.locator('[data-tab="difference"] svg.bp-cloud path')
  await expect(cloud).toHaveAttribute('d', /^M8 8/)
  expect(await cloud.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(255, 209, 102)')
  await app.close()
})
