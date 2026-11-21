import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch } from './launch'

test('shows the Folder given on the command line', async () => {
  const { app, page, folder } = await launch()
  await expect(page.getByRole('banner')).toContainText(folder)
  await app.close()
})

test('offers the folder picker when no Folder is given', async () => {
  const { app, page } = await launch({ folder: null })
  const dir = mkdtempSync(join(tmpdir(), 'blueprint-picked-'))
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] })
  }, dir)
  await page.getByRole('button', { name: 'Open Folder' }).click()
  await expect(page.getByRole('banner')).toContainText(dir)
  await app.close()
})

test('explains a bad Folder argument', async () => {
  const { app, page } = await launch({ folder: '/nonexistent/x' })
  await expect(page.getByText('Not a folder: /nonexistent/x')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
  await app.close()
})
