import { join } from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import { resolveFolder } from './folder'
import { registerIpc } from './ipc'
import { TerminalManager } from './terminal/manager'

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
  // Blueprint asks for no browser permissions. Denying them also keeps the ligatures add-on on its built-in list.
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, done) => done(false))
  win.once('ready-to-show', () => win.show())
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// No app menu: its shortcuts (Ctrl+W closes, Ctrl+R reloads) would take keys from the terminals.
Menu.setApplicationMenu(null)

void app.whenReady().then(() => {
  const folder = resolveFolder(process.argv, { packaged: app.isPackaged, cwd: process.cwd() })
  const win = createWindow()
  const send = (channel: string, ...args: unknown[]): void => {
    if (!win.webContents.isDestroyed()) win.webContents.send(channel, ...args)
  }
  const manager = new TerminalManager({
    data: (tabId, data) => send('terminal:data', tabId, data),
    exit: (tabId, exit) => send('terminal:exit', tabId, exit),
  })
  registerIpc(win, { folder, manager })
  // No terminal outlives the window: quitting ends every Claude session and shell.
  app.on('window-all-closed', () => {
    manager.killAll()
    app.quit()
  })
  app.on('before-quit', () => manager.killAll())
})
