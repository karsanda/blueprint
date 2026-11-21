import { appendFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import type { ReviewState } from '../../src/shared/api'
import { gitFolder, lastReview, launch, probeText, readLog, typeInto, watchReview } from './launch'

function paths(state: ReviewState | undefined): [string, boolean][] | undefined {
  return state?.kind === 'changes'
    ? state.changes.map((c): [string, boolean] => [c.path, c.byClaude])
    : undefined
}

test("Claude's edits after a prompt reach the review", async () => {
  const { page } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await watchReview(page)
  await typeInto(page, 'claude-1', 'pww')
  await expect
    .poll(async () => paths(await lastReview(page)))
    .toEqual([
      ['claude-1.txt', true],
      ['claude-2.txt', true],
    ])
})

test("a file Claude's shell command makes is Claude's", async () => {
  const { page } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await watchReview(page)
  await typeInto(page, 'claude-1', 'pb')
  await expect.poll(async () => paths(await lastReview(page))).toEqual([['bash-made.txt', true]])
})

test("Claude Code's own message does not start a new turn", async () => {
  const { page, log } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await watchReview(page)
  await typeInto(page, 'claude-1', 'pwg')
  await expect
    .poll(() => readLog(log, 'claude.hooks'))
    .toBe('UserPromptSubmit 204\nPostToolUse 204\nUserPromptSubmit 204\n')
  await typeInto(page, 'claude-1', 's')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('Stop 204')
  await expect.poll(async () => paths(await lastReview(page))).toEqual([['claude-1.txt', true]])
})

test("Blueprint's snapshots write nothing into the Folder's repository", async () => {
  const folder = gitFolder()
  const objects = (): string[] =>
    readdirSync(join(folder, '.git/objects'), { recursive: true }).map(String).toSorted()
  const before = {
    objects: objects(),
    index: statSync(join(folder, '.git/index')).mtimeMs,
  }
  const { page } = await launch({ folder })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await watchReview(page)
  await typeInto(page, 'claude-1', 'pws')
  await expect.poll(async () => paths(await lastReview(page))).toEqual([['claude-1.txt', true]])
  expect(objects()).toEqual(before.objects)
  expect(statSync(join(folder, '.git/index')).mtimeMs).toBe(before.index)
})

test('a Folder outside Git still gets every hook answered', async () => {
  const { page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await watchReview(page)
  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toBe('UserPromptSubmit 204\n')
  await expect
    .poll(() => lastReview(page))
    .toEqual({
      kind: 'no-git',
      message: 'Review needs Git. This Folder is not a Git repository.',
    })
})

const rowsOf = (page: Page) => page.locator('[data-tab="changes"] [data-path]')
const rowPaths = (page: Page) =>
  rowsOf(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-path')))

async function readyClaude(page: Page): Promise<void> {
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
}

test('the default layout puts Changes on the left and Difference beside Claude, over the shell', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  const group = (title: string) =>
    page.locator('.dv-groupview', {
      has: page.locator('.dv-tab', { hasText: title }),
    })
  const box = async (title: string) => (await group(title).boundingBox())!
  const dock = (await page.locator('.dv-dockview').first().boundingBox())!
  const [changes, claude, difference, shell] = [
    await box('Changes'),
    await box('Claude'),
    await box('Difference'),
    await box('Shell'),
  ]
  expect(Math.abs(changes.x - dock.x)).toBeLessThanOrEqual(10)
  expect(Math.abs(changes.y - dock.y)).toBeLessThanOrEqual(10)
  expect(Math.abs(changes.height - dock.height)).toBeLessThanOrEqual(10)
  expect(Math.abs(claude.y - difference.y)).toBeLessThanOrEqual(2)
  expect(difference.x).toBeGreaterThan(claude.x)
  expect(shell.y).toBeGreaterThan(Math.max(claude.y + claude.height, difference.y + difference.height) - 10)
  expect(Math.abs(shell.x - claude.x)).toBeLessThanOrEqual(10)
  expect(Math.abs(shell.x + shell.width - (difference.x + difference.width))).toBeLessThanOrEqual(10)
})

test('the list shows exactly the two files Claude edits after the prompt', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pww')
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt', 'claude-2.txt'])
  for (const row of await rowsOf(page).all())
    await expect(row.getByRole('img', { name: 'Claude' })).toBeVisible()
})

test("only Claude's file is listed when the Developer edited another file before the prompt", async () => {
  const folder = gitFolder()
  const { page } = await launch({ folder })
  await readyClaude(page)
  appendFileSync(join(folder, 'notes.txt'), 'by the developer\n')
  await typeInto(page, 'claude-1', 'pw')
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt'])
})

test('a file a formatter changes mid-turn shows as changed outside Claude', async () => {
  const folder = gitFolder()
  const { page } = await launch({ folder })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pw')
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt'])
  writeFileSync(join(folder, 'README.md'), 'formatted\n')
  const readme = page.locator('[data-tab="changes"] [data-path="README.md"]')
  await expect(readme).toHaveAttribute('data-by', 'outside', { timeout: 5000 })
  await expect(readme.getByRole('img', { name: 'Changed outside Claude' })).toBeVisible()
  await expect(page.locator('[data-tab="changes"] [data-path="claude-1.txt"]')).toHaveAttribute(
    'data-by',
    'claude',
  )
})

test('the review explains that it needs Git when the Folder is not under Git', async () => {
  const { page } = await launch()
  await expect(page.locator('[data-tab="changes"]')).toContainText(
    'Review needs Git. This Folder is not a Git repository.',
  )
})

test('This turn says there is no prompt yet before the first prompt', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await expect(page.locator('[data-tab="changes"]')).toContainText(
    'No prompt yet. Changes show here after your first prompt.',
  )
})

test('This session lists the Changes from both turns of a session', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pwsp')
  await typeInto(page, 'claude-1', 'w')
  await expect.poll(() => rowPaths(page)).toEqual(['claude-2.txt'])
  const session = page.getByRole('button', { name: 'This session' })
  await session.click()
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt', 'claude-2.txt'])
  await expect(session).toHaveAttribute('aria-pressed', 'true')
})

test('This session survives /clear', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pwsc')
  await typeInto(page, 'claude-1', 'pw')
  await page.getByRole('button', { name: 'This session' }).click()
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt', 'claude-2.txt'])
})
