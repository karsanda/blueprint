import { expect, type Locator, type Page, test } from '@playwright/test'
import { dropTab, launch, probeSize, probeText, readLog } from './launch'

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: title }) })
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}

async function tabTitles(group: Locator): Promise<string[]> {
  return (await group.locator('.dv-tab').allTextContents()).map((t) => t.trim())
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? ''
}

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
}

test('dragging the gap resizes both panes and their content', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const claude = groupWith(page, 'Claude')
  const difference = groupWith(page, 'Difference')
  const [claudeBefore, differenceBefore] = [await box(claude), await box(difference)]
  const claudeCols = (await probeSize(page, 'claude-1'))!.cols

  // The gap between Claude and Difference is the vertical sash that sits between their edges.
  const sashes = await page.locator('.dv-sash').evaluateAll((els) =>
    els.map((e) => {
      const { x, y, width, height } = e.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
  const gapX = claudeBefore.x + claudeBefore.width
  const sash = sashes.find(
    (r) =>
      r.height > r.width &&
      r.x >= gapX - 14 &&
      r.x <= differenceBefore.x + 4 &&
      r.y < claudeBefore.y + claudeBefore.height,
  )
  if (!sash) throw new Error('no sash between Claude and Difference')
  const x = sash.x + sash.width / 2
  const y = sash.y + sash.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 200, y, { steps: 10 })
  await page.mouse.up()

  expect(Math.abs(claudeBefore.width - (await box(claude)).width - 200)).toBeLessThanOrEqual(10)
  expect((await box(difference)).width).toBeGreaterThan(differenceBefore.width)
  await expect.poll(async () => (await probeSize(page, 'claude-1'))!.cols).toBeLessThan(claudeCols)
  const size = await probeSize(page, 'claude-1')
  await expect.poll(() => lastLine(readLog(log, 'claude.size'))).toBe(`${size!.cols}x${size!.rows}`)
  await app.close()
})

test('Claude Code fills the pane after the window resizes', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const before = (await probeSize(page, 'claude-1'))!
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 600))
  await expect.poll(async () => (await probeSize(page, 'claude-1'))!.cols).toBeLessThan(before.cols)
  await expect
    .poll(async () => {
      const size = await probeSize(page, 'claude-1')
      return lastLine(readLog(log, 'claude.size')) === `${size!.cols}x${size!.rows}`
    })
    .toBe(true)
  await app.close()
})

test("dropping a tab on a pane's middle joins its tabs", async () => {
  const { app, page } = await launch()
  await ready(page)
  const target = await box(groupWith(page, 'Claude').locator('.dv-content-container'))
  await dropTab(page, 'Shell', target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(3)
  expect(await tabTitles(groupWith(page, 'Claude'))).toEqual(['Claude', 'Shell'])
  await app.close()
})

test("dropping a tab on a pane's edge splits that pane", async () => {
  const { app, page } = await launch()
  await ready(page)
  const content = () => groupWith(page, 'Claude').locator('.dv-content-container')
  let target = await box(content())
  await dropTab(page, 'Shell', target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(3)

  target = await box(content())
  await dropTab(page, 'Shell', target.x + target.width * 0.95, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(4)
  expect((await box(groupWith(page, 'Shell'))).x).toBeGreaterThan((await box(groupWith(page, 'Claude'))).x)
  await app.close()
})

test('zooming out returns the previous layout', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const claude = groupWith(page, 'Claude')
  const shell = groupWith(page, 'Shell')
  const changes = groupWith(page, 'Changes')
  const [claudeBefore, shellBefore, changesBefore] = [await box(claude), await box(shell), await box(changes)]
  await page.waitForTimeout(300)
  const shellSizes = readLog(log, 'fake-shell.size')

  await claude.getByRole('button', { name: 'Zoom pane' }).click()
  await expect(shell).toBeHidden()
  expect((await box(claude)).width).toBeGreaterThan(changesBefore.width + shellBefore.width)
  // The hidden pane's program keeps its size: it is never squeezed to nothing.
  await page.waitForTimeout(300)
  expect(readLog(log, 'fake-shell.size')).toBe(shellSizes)

  await claude.getByRole('button', { name: 'Zoom out' }).click()
  await expect(shell).toBeVisible()
  for (const [now, before] of [
    [await box(claude), claudeBefore],
    [await box(shell), shellBefore],
  ] as const) {
    expect(Math.abs(now.x - before.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(now.width - before.width)).toBeLessThanOrEqual(1)
  }
  await app.close()
})

test('tabs have no close action until a closed tab can be reopened', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  await expect(page.locator('.dv-default-tab-action')).toHaveCount(0)
  await page.locator('.dv-tab', { hasText: 'Shell' }).click({ button: 'middle' })
  await page.waitForTimeout(300)
  await expect(page.locator('.dv-tab')).toHaveCount(4)
  const pid = JSON.parse(readLog(log, 'fake-shell.start').trim().split('\n')[0] ?? '{}').pid
  expect(() => process.kill(pid, 0)).not.toThrow()
  await app.close()
})
