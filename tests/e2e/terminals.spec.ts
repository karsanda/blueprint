import { expect, test } from '@playwright/test'
import { launch, probeSize, probeText, readLog, typeInto } from './launch'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? ''
}

test('a Claude session starts in the opened Folder', async () => {
  const { app, page, log, folder } = await launch()
  await expect.poll(() => readLog(log, 'claude.start')).not.toBe('')
  const start = JSON.parse(lastLine(readLog(log, 'claude.start')))
  expect(start.cwd).toBe(folder)
  expect(start.args[0]).toBe('--session-id')
  expect(start.args[1]).toMatch(UUID)
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await app.close()
})

test('Claude Code receives exactly the typed prompt', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'Fix the login bug => please')
  await expect.poll(() => readLog(log, 'claude.input')).toBe('Fix the login bug => please')
  await app.close()
})

test('a shell starts in the Folder', async () => {
  const { app, page, log, folder } = await launch()
  await expect.poll(() => readLog(log, 'fake-shell.start')).not.toBe('')
  expect(JSON.parse(lastLine(readLog(log, 'fake-shell.start'))).cwd).toBe(folder)
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await app.close()
})

test('a full-screen program fills the tab and responds to keys', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await typeInto(page, 'shell-1', 'f')
  await expect.poll(() => readLog(log, 'fake-shell.size')).not.toBe('')
  const size = await probeSize(page, 'shell-1')
  expect(lastLine(readLog(log, 'fake-shell.size'))).toBe(`${size?.cols}x${size?.rows}`)
  await expect.poll(async () => lastLine(await probeText(page, 'shell-1'))).toContain('BOTTOM')
  await typeInto(page, 'shell-1', 'x')
  await expect.poll(() => readLog(log, 'fake-shell.input')).toMatch(/fx$/)
  await app.close()
})

test('terminals draw without WebGL', async () => {
  const { app, page } = await launch({ args: ['--disable-gpu'] })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await app.close()
})
