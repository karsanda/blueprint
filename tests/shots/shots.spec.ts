import { expect, test } from '@playwright/test'
import { gitFolder, launch, probeText, typeInto } from '../e2e/launch'

test('build step 1 screens', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await expect.poll(() => probeText(page, 'shell-1')).toContain('fake-shell ready')
  await page.locator('[data-tab="claude-1"]').click()
  await page.screenshot({ path: '.shots/step-1-default.png' })
  await page
    .locator('.dv-groupview', { hasText: 'Claude' })
    .getByRole('button', { name: 'Zoom pane' })
    .click()
  await page.waitForTimeout(300) // let the terminal refit and redraw at the new size
  await page.screenshot({ path: '.shots/step-1-zoomed.png' })
  await app.close()

  const missing = await launch({ path: 'no-claude' })
  await expect(missing.page.getByRole('button', { name: 'Restart' })).toBeVisible()
  await missing.page.screenshot({ path: '.shots/step-1-not-installed.png' })
  await missing.app.close()
})

test('build step 2 screens', async () => {
  const { app, page } = await launch()
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'p')
  await expect(page.locator('[data-tab="claude-1"]')).toHaveAttribute('data-status', 'working')
  await page.screenshot({ path: '.shots/step-2-working.png' })
  await typeInto(page, 'claude-1', '?')
  await expect(page.locator('[data-tab="claude-1"]')).toHaveAttribute('data-status', 'needs-you')
  await page.screenshot({ path: '.shots/step-2-needs-you.png' })
  await app.close()
})

test('build step 3 screens', async () => {
  const { app, page } = await launch({ folder: gitFolder() })
  await expect.poll(() => probeText(page, 'claude-1')).toContain('claude ready')
  await typeInto(page, 'claude-1', 'pwe')
  const notes = page.locator('[data-tab="changes"] [data-path="notes.txt"]')
  await notes.click()
  await expect(page.locator('[data-tab="difference"] svg.bp-cloud')).toHaveCount(1)
  await page.waitForTimeout(300)
  await page.screenshot({ path: '.shots/step-3-review.png' })
  await page.getByRole('button', { name: 'This session' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '.shots/step-3-session.png' })
  await app.close()
})
