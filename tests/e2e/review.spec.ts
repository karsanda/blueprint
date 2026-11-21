import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
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
  const before = { objects: objects(), index: statSync(join(folder, '.git/index')).mtimeMs }
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
    .toEqual({ kind: 'no-git', message: 'Review needs Git. This Folder is not a Git repository.' })
})
