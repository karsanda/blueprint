import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { layoutFile } from '../../src/main/layout/store'
import { dropTab, launch, probeText } from './launch'

test('the window comes back at the same size and place', async () => {
  const first = await launch()
  await first.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 100, y: 80, width: 1000, height: 700 }),
  )
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    const bounds = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBounds(),
    )
    expect(bounds).toBeDefined()
    expect(Math.abs((bounds?.x ?? 0) - 100)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.y ?? 0) - 80)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.width ?? 0) - 1000)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.height ?? 0) - 700)).toBeLessThanOrEqual(2)
  } finally {
    await second.app.close()
  }
})

function groupWith(page: Page, title: string): Locator {
  return page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: title }) })
}

async function tabTitles(group: Locator): Promise<string[]> {
  return (await group.locator('.dv-tab').allTextContents()).map((t) => t.trim())
}

async function width(locator: Locator): Promise<number> {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not visible')
  return b.width
}

/** Opens the app once to learn where it keeps its user data, then closes it. Returns the layout file of the Folder. */
async function layoutFileOf(): Promise<{ folder: string; home: string; file: string }> {
  const first = await launch()
  const userData = await first.app.evaluate(({ app }) => app.getPath('userData'))
  await first.app.close()
  return { folder: first.folder, home: first.home, file: layoutFile(userData, first.folder) }
}

function writeLayoutFile(file: string, folder: string, dockview: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(
    file,
    typeof dockview === 'string' ? dockview : JSON.stringify({ version: 1, folder, dockview }),
  )
}

function panel(id: string, title: string, kind: string) {
  return { id, contentComponent: 'terminal', title, params: { kind }, renderer: 'always' }
}

/** A hand-built dockview layout: one group holding Claude and Shell, plus any extra panels. */
function claudeAndShell(extra: string[] = []): object {
  const ids = ['claude-1', 'shell-1', ...extra]
  return {
    grid: {
      root: {
        type: 'branch',
        data: [{ type: 'leaf', data: { views: ids, activeView: 'claude-1', id: '1' }, size: 800 }],
        size: 1000,
      },
      width: 1280,
      height: 800,
      orientation: 'HORIZONTAL',
    },
    panels: Object.fromEntries(
      ids.map((id) => [
        id,
        panel(id, id === 'shell-1' ? 'Shell' : id === 'claude-1' ? 'Claude' : id, 'shell'),
      ]),
    ),
    activeGroup: '1',
  }
}

async function expectDefault(page: Page): Promise<void> {
  await expect(page.locator('.dv-groupview')).toHaveCount(4)
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
}

test('the layout is the same when the Developer reopens the Folder', async () => {
  const first = await launch()
  await expect.poll(() => probeText(first.page, 'shell-1')).toContain('fake-shell ready')
  const claude = groupWith(first.page, 'Claude')
  const cb = (await claude.boundingBox())!
  await dropTab(first.page, 'Shell', cb.x + cb.width / 2, cb.y + cb.height / 2)
  await expect(first.page.locator('.dv-groupview')).toHaveCount(3)
  const changes = groupWith(first.page, 'Changes')
  const chb = (await changes.boundingBox())!
  const sash = await first.page.locator('.dv-sash').evaluateAll((els, edge) => {
    const r = els
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.height > b.width && Math.abs(b.x - edge) < 14)
    return r[0] ? { x: r[0].x + r[0].width / 2, y: r[0].y + r[0].height / 2 } : null
  }, chb.x + chb.width)
  if (!sash) throw new Error('no sash right of Changes')
  await first.page.mouse.move(sash.x, sash.y)
  await first.page.mouse.down()
  await first.page.mouse.move(sash.x + 100, sash.y, { steps: 10 })
  await first.page.mouse.up()
  const recorded = await width(changes)
  expect(recorded).toBeGreaterThan(chb.width + 50)
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(second.page.locator('.dv-groupview')).toHaveCount(3)
    expect(await tabTitles(groupWith(second.page, 'Claude'))).toEqual(['Claude', 'Shell'])
    expect(Math.abs((await width(groupWith(second.page, 'Changes'))) - recorded)).toBeLessThanOrEqual(10)
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain('claude ready')
    await groupWith(second.page, 'Shell').locator('.dv-tab', { hasText: 'Shell' }).click()
    await expect.poll(() => probeText(second.page, 'shell-1')).toContain('fake-shell ready')
  } finally {
    await second.app.close()
  }
})

test('a Folder opened for the first time gets the default layout', async () => {
  const first = await launch()
  await dropTab(first.page, 'Shell', 600, 300)
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ home: first.home })
  try {
    await expectDefault(second.page)
  } finally {
    await second.app.close()
  }
})

test('a broken saved layout gives the default layout', async () => {
  const { folder, home, file } = await layoutFileOf()
  for (const content of ['{', claudeAndShell(['nope'])]) {
    writeLayoutFile(file, folder, content)
    const run = await launch({ folder, home })
    try {
      await expectDefault(run.page)
    } finally {
      await run.app.close()
    }
  }
})

test('a layout saved without the review panes gets them back', async () => {
  const { folder, home, file } = await layoutFileOf()
  writeLayoutFile(file, folder, claudeAndShell())
  const run = await launch({ folder, home })
  try {
    await expect(run.page.locator('.dv-groupview')).toHaveCount(3)
    await expect(groupWith(run.page, 'Changes')).toHaveCount(1)
    await expect(groupWith(run.page, 'Difference')).toHaveCount(1)
    expect(await tabTitles(groupWith(run.page, 'Claude'))).toEqual(['Claude', 'Shell'])
  } finally {
    await run.app.close()
  }
})

test('a Folder closed while zoomed reopens unzoomed', async () => {
  const first = await launch()
  await expect(first.page.locator('.dv-groupview')).toHaveCount(4)
  await groupWith(first.page, 'Claude').getByTitle('Zoom pane').click()
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    await expect(second.page.locator('.dv-groupview')).toHaveCount(4)
    await expect(second.page.getByTitle('Zoom out')).toHaveCount(0)
    for (const g of await second.page.locator('.dv-groupview').all())
      expect(await width(g)).toBeGreaterThan(50)
  } finally {
    await second.app.close()
  }
})
