import { expect, test } from '@playwright/test'
import { launch, probeText } from '../e2e/launch'

test('build step 1 screens', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await page.locator('[data-tab="claude-1"]').click()
  await page.screenshot({ path: '.shots/step-1-default.png' })
  await page.getByRole('button', { name: 'Zoom pane' }).first().click()
  await page.waitForTimeout(300) // let the terminal refit and redraw at the new size
  await page.screenshot({ path: '.shots/step-1-zoomed.png' })
  await app.close()

  const missing = await launch({ path: 'no-claude' })
  await expect(missing.page.getByRole('button', { name: 'Restart' })).toBeVisible()
  await missing.page.screenshot({ path: '.shots/step-1-not-installed.png' })
  await missing.app.close()
})
