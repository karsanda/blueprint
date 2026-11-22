import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { layoutFile } from '../../src/main/layout/store'
import { launch, type Launched, probeText, readLog, typeInto } from './launch'

const NOTICE = 'The last conversation could not be found, so a new one started.'

/** The args of the first start of one fake instance. */
function startArgs(log: string, stem: string): string[] {
  const line = readLog(log, `${stem}.start`).trim().split('\n')[0] ?? '{}'
  const parsed: { args?: string[] } = JSON.parse(line)
  return parsed.args ?? []
}

/** A tab's session id: the last one its fake took. */
function sessionOf(log: string, stem: string): string {
  return readLog(log, `${stem}.sessions`).trim().split('\n').at(-1) ?? ''
}

/** The Developer sends a prompt in a tab, and Blueprint hears it. */
async function prompt(page: Page, log: string, tabId: string, stem: string, keys = 'p'): Promise<void> {
  // Keys typed before the program is up are lost.
  await expect.poll(() => probeText(page, tabId)).toContain('claude ready')
  const before = readLog(log, `${stem}.hooks`).split('UserPromptSubmit 204').length
  await typeInto(page, tabId, keys)
  await expect
    .poll(() => readLog(log, `${stem}.hooks`).split('UserPromptSubmit 204').length)
    .toBeGreaterThan(before)
}

async function openSecondSession(page: Page, expectedId: string): Promise<void> {
  await page
    .locator('.dv-groupview', { has: page.locator('.dv-tab', { hasText: 'Claude' }) })
    .first()
    .getByRole('button', { name: 'New Claude session' })
    .click()
  await expect.poll(() => probeText(page, expectedId)).toContain('claude')
}

/** Waits for the layout save and closes Blueprint. Returns the Folder's layout file. */
async function close(first: Launched): Promise<{ layout: string }> {
  await first.page.waitForTimeout(1000)
  const userData = await first.app.evaluate(({ app }) => app.getPath('userData'))
  await first.app.close()
  return { layout: layoutFile(userData, first.folder) }
}

async function relaunch(first: Launched): Promise<Launched> {
  return launch({ folder: first.folder, home: first.home })
}

test('a Claude session continues its conversation when the Developer reopens the Folder', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  const id = sessionOf(first.log, 'claude')
  await close(first)
  const second = await relaunch(first)
  try {
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain(`resumed ${id}`)
    const args = startArgs(second.log, 'claude')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe(id)
    expect(args).not.toContain('--session-id')
  } finally {
    await second.app.close()
  }
})

test('a conversation that cannot be found starts a new one with a notice', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  const id = sessionOf(first.log, 'claude')
  await close(first)
  rmSync(join(first.log, `${id}.jsonl`))
  const second = await relaunch(first)
  try {
    const notice = second.page.getByRole('status').filter({ hasText: NOTICE })
    await expect(notice).toBeVisible()
    const args = startArgs(second.log, 'claude')
    expect(args).toContain('--session-id')
    expect(args).not.toContain('--resume')
    await notice.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)
  } finally {
    await second.app.close()
  }
})

test('a saved id that is not a session id never reaches Claude Code', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  const { layout } = await close(first)
  const saved = JSON.parse(readFileSync(layout, 'utf8'))
  const conversation = saved.dockview.panels['claude-1'].params.conversation
  // Its file name is `<sessionId>.jsonl` and the file exists, so only the UUID rule can stop it.
  conversation.sessionId = '--dangerously-skip-permissions'
  conversation.transcript = join(dirname(conversation.transcript), '--dangerously-skip-permissions.jsonl')
  writeFileSync(conversation.transcript, '')
  writeFileSync(layout, JSON.stringify(saved))
  const second = await relaunch(first)
  try {
    await expect(second.page.getByRole('status').filter({ hasText: NOTICE })).toBeVisible()
    await expect.poll(() => readLog(second.log, 'claude.start')).not.toBe('')
    const args = startArgs(second.log, 'claude')
    expect(args).not.toContain('--dangerously-skip-permissions')
    expect(args).not.toContain('--resume')
  } finally {
    await second.app.close()
  }
})

test('each session resumes its own conversation', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  await openSecondSession(first.page, 'claude-2')
  await prompt(first.page, first.log, 'claude-2', 'claude2')
  const id1 = sessionOf(first.log, 'claude')
  const id2 = sessionOf(first.log, 'claude2')
  expect(id1).not.toBe(id2)
  await close(first)
  const second = await relaunch(first)
  try {
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain(`resumed ${id1}`)
    await expect.poll(() => probeText(second.page, 'claude-2')).toContain(`resumed ${id2}`)
    await openSecondSession(second.page, 'claude-3')
    expect(startArgs(second.log, 'claude3')).toContain('--session-id')
    expect(startArgs(second.log, 'claude3')).not.toContain('--resume')
  } finally {
    await second.app.close()
  }
})

test('a restarted session starts a new conversation after reopening', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  await typeInto(first.page, 'claude-1', '~')
  await first.page.getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => readLog(first.log, 'claude.start').trim().split('\n').length).toBe(2)
  await close(first)
  const second = await relaunch(first)
  try {
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain('claude ready')
    expect(startArgs(second.log, 'claude')).toContain('--session-id')
    await expect(second.page.getByRole('status').filter({ hasText: NOTICE })).toHaveCount(0)
  } finally {
    await second.app.close()
  }
})

test('after /clear the newer conversation is the one resumed', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  await typeInto(first.page, 'claude-1', 'c')
  await expect.poll(() => readLog(first.log, 'claude.hooks')).toContain('clear')
  await prompt(first.page, first.log, 'claude-1', 'claude')
  const id = sessionOf(first.log, 'claude')
  await close(first)
  const second = await relaunch(first)
  try {
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain(`resumed ${id}`)
  } finally {
    await second.app.close()
  }
})

test('a session that failed to start resumes its conversation on Restart', async () => {
  const first = await launch()
  await prompt(first.page, first.log, 'claude-1', 'claude')
  const id = sessionOf(first.log, 'claude')
  await close(first)
  const second = await launch({ folder: first.folder, home: first.home, path: 'no-claude' })
  try {
    await expect(second.page.getByRole('button', { name: 'Restart' })).toBeVisible()
    // Claude Code becomes findable again in the running app, as if the Developer had installed it.
    await second.app.evaluate(
      (_electron, dir) => {
        process.env['PATH'] = `${dir}:${process.env['PATH'] ?? ''}`
      },
      resolve(__dirname, 'fixtures/bin'),
    )
    await second.page.getByRole('button', { name: 'Restart' }).click()
    await expect.poll(() => probeText(second.page, 'claude-1')).toContain(`resumed ${id}`)
    const args = startArgs(second.log, 'claude')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe(id)
  } finally {
    await second.app.close()
  }
})
