import { appendFileSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import type { ReviewState } from '../../src/shared/api'
import { dropTab, gitFolder, lastReview, launch, probeText, readLog, typeInto, watchReview } from './launch'

function paths(state: ReviewState | undefined): [string, boolean][] | undefined {
  return state?.kind === 'changes'
    ? state.changes.map((c): [string, boolean] => [c.path, c.by.length > 0])
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
  const { page, log } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pwsc')
  // The fake clears only after the posts typed before it, as Claude Code would.
  await expect
    .poll(() => readLog(log, 'claude.hooks'))
    .toBe('UserPromptSubmit 204\nPostToolUse 204\nStop 204\nclear\n')
  await typeInto(page, 'claude-1', 'pw')
  await page.getByRole('button', { name: 'This session' }).click()
  await expect.poll(() => rowPaths(page)).toEqual(['claude-1.txt', 'claude-2.txt'])
})

test('the review stops refreshing while the Changes pane is hidden', async () => {
  const folder = gitFolder()
  const { page, log } = await launch({ folder })
  await readyClaude(page)
  const target = (await page
    .locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: 'Shell' }) })
    .locator('.dv-content-container')
    .boundingBox())!
  await dropTab(page, 'Changes', target.x + target.width / 2, target.y + target.height / 2)
  await expect(
    page.locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: 'Changes' }) }),
  ).toContainText('Shell')
  await page.locator('.dv-tab', { hasText: 'Shell' }).click()
  await expect(page.locator('[data-tab="changes"]')).toBeHidden()
  await page.evaluate(() => {
    window.reviewStates = []
    window.blueprint.onReviewUpdate((state) => window.reviewStates?.push(state))
  })
  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('UserPromptSubmit 204')
  writeFileSync(join(folder, 'README.md'), 'changed while hidden\n')
  await page.waitForTimeout(3000)
  const listed = () =>
    page.evaluate(() =>
      (window.reviewStates ?? []).flatMap((s) => (s.kind === 'changes' ? s.changes.map((c) => c.path) : [])),
    )
  expect(await listed()).not.toContain('README.md')
  await page.locator('.dv-tab', { hasText: 'Changes' }).click()
  await expect.poll(listed, { timeout: 5000 }).toContain('README.md')
})

const diffRows = (page: Page, kind: 'add' | 'del') =>
  page.locator(`[data-tab="difference"] .bp-diff-row[data-kind="${kind}"]`)
const pick = (page: Page, path: string) => page.locator(`[data-tab="changes"] [data-path="${path}"]`).click()

test('picking a listed file shows its added and removed lines', async () => {
  const { page } = await launch({ folder: gitFolder() })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pe')
  await pick(page, 'notes.txt')
  await expect(diffRows(page, 'del')).toContainText('notes: first line')
  await expect(diffRows(page, 'add')).toContainText('notes: changed by Claude')
  await expect(page.locator('[data-tab="difference"] svg.bp-cloud')).toHaveCount(1)
})

test('a change outside Claude has no revision cloud', async () => {
  const folder = gitFolder()
  const { page, log } = await launch({ folder })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('UserPromptSubmit 204')
  writeFileSync(join(folder, 'README.md'), '# Test Folder\n\nEdited by the Developer.\n')
  await pick(page, 'README.md')
  await expect(diffRows(page, 'add')).toContainText('Edited by the Developer.')
  await expect(page.locator('[data-tab="difference"] svg.bp-cloud')).toHaveCount(0)
})

test('the difference follows a file that changes again', async () => {
  const folder = gitFolder()
  const { page } = await launch({ folder })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pe')
  await pick(page, 'notes.txt')
  await expect(diffRows(page, 'add')).toContainText('notes: changed by Claude')
  appendFileSync(join(folder, 'notes.txt'), 'notes: third line\n')
  await expect(diffRows(page, 'add').filter({ hasText: 'notes: third line' })).toHaveCount(1, {
    timeout: 5000,
  })
})

test('the difference follows a file that changes again with the same counts', async () => {
  const folder = gitFolder()
  const { page } = await launch({ folder })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'pe')
  await pick(page, 'notes.txt')
  await expect(diffRows(page, 'add')).toContainText('notes: changed by Claude')
  const notes = join(folder, 'notes.txt')
  writeFileSync(
    notes,
    readFileSync(notes, 'utf8').replace('notes: changed by Claude', 'notes: changed again'),
  )
  await expect(diffRows(page, 'add')).toContainText('notes: changed again', { timeout: 5000 })
})

test('a new file and a deleted file show whole, and a binary file says so', async () => {
  const folder = gitFolder()
  const { page, log } = await launch({ folder })
  await readyClaude(page)
  await typeInto(page, 'claude-1', 'p')
  await expect.poll(() => readLog(log, 'claude.hooks')).toContain('UserPromptSubmit 204')
  writeFileSync(join(folder, 'new.txt'), 'alpha\nbeta\n')
  await pick(page, 'new.txt')
  await expect(diffRows(page, 'add')).toHaveCount(2)
  rmSync(join(folder, 'README.md'))
  await pick(page, 'README.md')
  await expect(diffRows(page, 'del')).toHaveCount(3)
  writeFileSync(join(folder, 'image.bin'), Buffer.from([0, 1, 0, 2, 0, 3]))
  await pick(page, 'image.bin')
  await expect(page.locator('[data-tab="difference"]')).toContainText('Binary file.')
})
