import { expect, test } from '@playwright/test'
import { launch } from './launch'

/** True when a FontFace of this family has finished loading (document.fonts.check alone passes for unknown families). */
function fontLoaded(family: string): boolean {
  return [...document.fonts].some((f) => f.family.replaceAll('"', '') === family && f.status === 'loaded')
}

test('opens a Blueprint window in the Blueprint look', async () => {
  const { app, page } = await launch()
  expect(await page.title()).toBe('Blueprint')
  await expect(page.getByRole('banner')).toContainText('BLUEPRINT')
  expect(await page.evaluate(fontLoaded, 'Overpass Variable')).toBe(true)
  expect(await page.evaluate(fontLoaded, 'Cascadia Code Variable')).toBe(true)
  await app.close()
})
