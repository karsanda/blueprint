import { basename, join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { resolveFolder } from './folder'
import { type IpcDeps, registerIpc } from './ipc'
import { NeedsYouNotifier } from './notify'
import { hookSettings, writeHookSettings } from './status/hooks'
import { startHookListener } from './status/listener'
import { StatusRelay } from './status/relay'
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
  // The window only ever shows Blueprint: a page it navigated to would get the terminal API.
  // Links (such as OSC 8 links in terminal output) open in the Developer's browser instead.
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
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

void app.whenReady().then(async () => {
  const folder = resolveFolder(process.argv, { packaged: app.isPackaged, cwd: process.cwd() })
  // The window is created after the listener and settings file exist, so every handler is
  // there before the renderer loads.
  let win: BrowserWindow | undefined
  const send = (channel: string, ...args: unknown[]): void => {
    if (win && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args)
  }
  const relay = new StatusRelay((tabId, signal) => send('status:signal', tabId, signal))
  const listener = await startHookListener((e) => relay.hook(e))
  const settings = writeHookSettings(hookSettings(listener.url, listener.token))
  win = createWindow()
  const manager = new TerminalManager({
    data: (tabId, data) => send('terminal:data', tabId, data),
    exit: (tabId, exit) => send('terminal:exit', tabId, exit),
  })
  const deps: IpcDeps = {
    folder,
    manager,
    relay,
    // The ipc module swaps in the Folder the Developer picks, so the notifier reads it through deps.
    notifier: new NeedsYouNotifier(
      win,
      () => basename(deps.folder.folder ?? ''),
      (tabId) => send('status:focus', tabId),
    ),
    settingsFile: settings.file,
  }
  registerIpc(win, deps)
  // Both events fire on quit, so the cleanup runs once.
  let cleaned = false
  const cleanUp = (): void => {
    manager.killAll()
    if (cleaned) return
    cleaned = true
    void listener.close()
    relay.close()
    settings.remove()
  }
  // No terminal outlives the window: quitting ends every Claude session and shell.
  app.on('window-all-closed', () => {
    cleanUp()
    app.quit()
  })
  app.on('before-quit', cleanUp)
})

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
