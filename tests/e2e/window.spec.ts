import { expect, test } from '@playwright/test'
import { launch, probeText } from './launch'

test('the window refuses to navigate away from Blueprint', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  const url = page.url()
  await page.evaluate(() => {
    location.href = 'file:///etc/hostname'
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(url)
  expect(await probeText(page, 'claude-1')).toContain('claude ready')
  await app.close()
})

test('web links open in the browser, and nothing opens an app window', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await app.evaluate(({ shell }) => {
    globalThis.openedUrls = []
    shell.openExternal = async (url: string) => {
      globalThis.openedUrls?.push(url)
    }
  })
  await page.evaluate(() => {
    window.open('https://example.com/docs')
    window.open('file:///etc/hostname')
  })
  await page.waitForTimeout(500)
  expect(app.windows().length).toBe(1)
  expect(await app.evaluate(() => globalThis.openedUrls)).toEqual(['https://example.com/docs'])
  await app.close()
})
