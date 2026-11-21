import { expect, test } from '@playwright/test'
import { launch } from './launch'

test('the window comes back at the same size and place', async () => {
  const first = await launch()
  await first.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 100, y: 80, width: 1000, height: 700 }),
  )
  await first.page.waitForTimeout(1000)
  await first.app.close()

  const second = await launch({ folder: first.folder, home: first.home })
  try {
    const bounds = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBounds(),
    )
    expect(bounds).toBeDefined()
    expect(Math.abs((bounds?.x ?? 0) - 100)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.y ?? 0) - 80)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.width ?? 0) - 1000)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds?.height ?? 0) - 700)).toBeLessThanOrEqual(2)
  } finally {
    await second.app.close()
  }
})
