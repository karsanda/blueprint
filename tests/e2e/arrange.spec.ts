import { expect, type Locator, type Page, test } from '@playwright/test'
import { launch, probeSize, probeText, readLog } from './launch'

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: title }) })
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}

async function tabTitles(group: Locator): Promise<string[]> {
  return (await group.locator('.dv-tab').allInnerTexts()).map((t) => t.trim())
}

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? ''
}

/**
 * Drags a tab onto a point of the page with the HTML5 drag events dockview listens for.
 * Playwright's dragTo starts a native drag session, which hangs a visible Electron window on Wayland.
 */
async function dropTab(page: Page, title: string, x: number, y: number): Promise<void> {
  const fire = (type: string, at: 'tab' | 'point') =>
    page.evaluate(
      ({ title, type, at, x, y }) => {
        const tab = [...document.querySelectorAll('.dv-tab')].find((t) => t.textContent?.trim() === title)
        if (!tab) throw new Error(`No tab ${title}`)
        const w = window as unknown as { dragData?: DataTransfer }
        w.dragData ??= new DataTransfer()
        const r = tab.getBoundingClientRect()
        const [cx, cy] = at === 'tab' ? [r.x + 5, r.y + 5] : [x, y]
        const el = at === 'tab' ? tab : document.elementFromPoint(x, y)
        el?.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            dataTransfer: w.dragData,
          }),
        )
        if (type === 'dragend') w.dragData = undefined
      },
      { title, type, at, x, y },
    )
  await fire('dragstart', 'tab')
  for (const type of ['dragenter', 'dragover', 'dragover', 'drop']) {
    await page.waitForTimeout(50)
    await fire(type, 'point')
  }
  await fire('dragend', 'tab')
}

async function ready(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
}

test('dragging the gap resizes both panes and their content', async () => {
  const { app, page, log } = await launch()
  await ready(page)
  const claude = groupWith(page, 'Claude')
  const shell = groupWith(page, 'Shell')
  const [claudeBefore, shellBefore] = [await box(claude), await box(shell)]
  const [claudeCols, shellCols] = [
    (await probeSize(page, 'claude-1'))!.cols,
    (await probeSize(page, 'shell-1'))!.cols,
  ]

  const sash = await box(
    page.locator('.dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash').first(),
  )
  const x = sash.x + sash.width / 2
  const y = sash.y + sash.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 200, y, { steps: 10 })
  await page.mouse.up()

  expect(Math.abs(claudeBefore.width - (await box(claude)).width - 200)).toBeLessThanOrEqual(10)
  expect((await box(shell)).width).toBeGreaterThan(shellBefore.width)
  await expect.poll(async () => (await probeSize(page, 'claude-1'))!.cols).toBeLessThan(claudeCols)
  await expect.poll(async () => (await probeSize(page, 'shell-1'))!.cols).toBeGreaterThan(shellCols)
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
  await expect(page.locator('.dv-groupview')).toHaveCount(1)
  expect(await tabTitles(page.locator('.dv-groupview'))).toEqual(['Claude', 'Shell'])
  await app.close()
})

test("dropping a tab on a pane's edge splits that pane", async () => {
  const { app, page } = await launch()
  await ready(page)
  const content = () => groupWith(page, 'Claude').locator('.dv-content-container')
  let target = await box(content())
  await dropTab(page, 'Shell', target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(1)

  target = await box(content())
  await dropTab(page, 'Shell', target.x + target.width * 0.95, target.y + target.height / 2)
  await expect(page.locator('.dv-groupview')).toHaveCount(2)
  expect((await box(groupWith(page, 'Shell'))).x).toBeGreaterThan((await box(groupWith(page, 'Claude'))).x)
  await app.close()
})

test('zooming out returns the previous layout', async () => {
  const { app, page } = await launch()
  await ready(page)
  const claude = groupWith(page, 'Claude')
  const shell = groupWith(page, 'Shell')
  const [claudeBefore, shellBefore] = [await box(claude), await box(shell)]

  await claude.getByRole('button', { name: 'Zoom pane' }).click()
  await expect(shell).toBeHidden()
  expect((await box(claude)).width).toBeGreaterThan(claudeBefore.width + shellBefore.width)

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
