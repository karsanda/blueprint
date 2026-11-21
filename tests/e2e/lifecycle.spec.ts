import { expect, test } from '@playwright/test'
import { launch, probeText, readLog, typeInto } from './launch'

function lines(text: string): string[] {
  return text.trim().split('\n').filter(Boolean)
}

function count(text: string, part: string): number {
  return text.split(part).length - 1
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('explains how to install Claude Code when it is missing', async () => {
  const { app, page } = await launch({ path: 'no-claude' })
  const pane = page.locator('[data-tab="claude-1"]')
  await expect(pane).toContainText('Claude Code is not installed, or Blueprint cannot find it on your PATH.')
  await expect(pane).toContainText(
    'Install it with: curl -fsSL https://claude.ai/install.sh | bash — then press Restart.',
  )
  await expect(pane.getByRole('button', { name: 'Restart' })).toBeVisible()
  await app.close()
})

test('keeps the output and offers a restart when Claude Code exits', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', '~')
  const pane = page.locator('[data-tab="claude-1"]')
  await expect(pane).toContainText('Claude Code exited (code 3).')
  expect(await probeText(page, 'claude-1')).toContain('claude ready')

  await pane.getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => lines(readLog(log, 'claude.start')).length).toBe(2)
  const [first, second] = lines(readLog(log, 'claude.start')).map((l) => JSON.parse(l).args[1])
  expect(second).not.toBe(first)
  await expect.poll(async () => count(await probeText(page, 'claude-1'), 'claude ready')).toBe(2)
  await expect(pane.getByRole('button', { name: 'Restart' })).toBeHidden()
  await app.close()
})

test('offers a new shell in the same tab when the shell exits', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await typeInto(page, 'shell-1', '~')
  const pane = page.locator('[data-tab="shell-1"]')
  await expect(pane).toContainText('Shell exited (code 3).')

  await pane.getByRole('button', { name: 'New shell' }).click()
  await expect.poll(() => lines(readLog(log, 'fake-shell.start')).length).toBe(2)
  await expect.poll(async () => count(await probeText(page, 'shell-1'), 'fake-shell ready')).toBe(2)
  await app.close()
})

test('quitting leaves no terminal processes behind', async () => {
  const { app, log } = await launch()
  await expect
    .poll(() => readLog(log, 'claude.start') !== '' && readLog(log, 'fake-shell.start') !== '')
    .toBe(true)
  const pids = ['claude.start', 'fake-shell.start'].map(
    (f) => JSON.parse(lines(readLog(log, f))[0] ?? '{}').pid,
  )
  await app.close()
  await expect.poll(() => pids.some(alive), { timeout: 3000 }).toBe(false)
})
