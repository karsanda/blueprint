// Renders build/icon.svg to build/icon.png (1024 × 1024, transparent corners), so no image tool is needed.
// It starts Electron through Playwright, shows the SVG in a window and takes its screenshot.
// Run: node scripts/render_icon.cjs
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const playwright = require('@playwright/test')

const root = path.join(__dirname, '..')
const main = `
const { app, BrowserWindow } = require('electron')
const { readFileSync } = require('node:fs')
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, frame: false, transparent: true })
  const svg = readFileSync(${JSON.stringify(path.join(root, 'build/icon.svg'))}, 'utf8')
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;background:transparent">' + svg + '</body>'))
})`

void (async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-icon-'))
  fs.writeFileSync(path.join(dir, 'main.cjs'), main)
  // oxlint-disable-next-line no-underscore-dangle -- Playwright names its Electron launcher `_electron`
  const app = await playwright._electron.launch({
    args: [
      path.join(dir, 'main.cjs'),
      '--no-sandbox',
      ...(process.platform === 'linux'
        ? ['--ozone-platform=headless', '--ozone-override-screen-size=1024,1024']
        : []),
    ],
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  await page.locator('svg').screenshot({ path: path.join(root, 'build/icon.png'), omitBackground: true })
  await app.close()
  fs.rmSync(dir, { recursive: true, force: true })
})()
