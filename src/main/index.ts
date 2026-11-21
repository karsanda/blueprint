import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { resolveFolder } from './folder'
import { registerIpc } from './ipc'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Blueprint',
    backgroundColor: '#163b6a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

void app.whenReady().then(() => {
  const folder = resolveFolder(process.argv, { packaged: app.isPackaged, cwd: process.cwd() })
  registerIpc(createWindow(), { folder })
})
app.on('window-all-closed', () => app.quit())
