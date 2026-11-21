import { type ElectronApplication, expect, test } from '@playwright/test'
import { launch, probeCall, probeText, readLog, typeInto } from './launch'

/** Runs `body`, then puts the Developer's clipboard back as it was. */
async function keepingClipboard(app: ElectronApplication, body: () => Promise<void>): Promise<void> {
  const saved = await app.evaluate(({ clipboard }) => clipboard.readText())
  try {
    await body()
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), saved)
  }
}

test('pasting sends the text to the shell', async () => {
  const { app, page, log } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await keepingClipboard(app, async () => {
    await app.evaluate(({ clipboard }) => clipboard.writeText('echo pasted'))
    await probeCall(page, 'focus', 'shell-1')
    await page.keyboard.press('Control+Shift+V')
    await expect.poll(() => readLog(log, 'fake-shell.input')).toBe('echo pasted')
  })
  await app.close()
})

test('Ctrl+Shift+C copies the selection', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await keepingClipboard(app, async () => {
    await probeCall(page, 'selectAll', 'shell-1')
    await probeCall(page, 'focus', 'shell-1')
    await page.keyboard.press('Control+Shift+C')
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('fake-shell ready')
  })
  await app.close()
})

test('Ctrl+W and Ctrl+R reach the program', async () => {
  const { app, page, log } = await launch()
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true)
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'a')
  await page.keyboard.press('Control+W')
  await page.keyboard.press('Control+R')
  await expect.poll(() => readLog(log, 'claude.input')).toBe('a\x17\x12')
  expect(app.windows().length).toBe(1)
  await app.close()
})
