import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, screen, shell } from 'electron'
import type { WindowBounds } from '../shared/api'
import { resolveFolder } from './folder'
import { type IpcDeps, registerIpc } from './ipc'
import { initialWindow, layoutFile, readLayout, writeLayout } from './layout/store'
import { NeedsYouNotifier } from './notify'
import { createReviewDir } from './review/git'
import { ReviewService } from './review/service'
import { createHookDir, hookSettings, writeHookSettings } from './status/hooks'
import { type HookListener, startHookListener } from './status/listener'
import { StatusRelay } from './status/relay'
import { TerminalManager } from './terminal/manager'

/** Where the window opens: the Folder's saved bounds when they are still on a display, the default otherwise. */
function createWindow(start: ReturnType<typeof initialWindow>): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...start.bounds,
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
  win.once('ready-to-show', () => {
    if (start.maximized) win.maximize()
    win.show()
  })
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
  let reviewDir: ReturnType<typeof createReviewDir> | undefined
  let review: ReviewService
  let listener: HookListener | undefined
  let hookDir: ReturnType<typeof createHookDir> | undefined
  try {
    reviewDir = createReviewDir(app.getPath('userData'))
    review = new ReviewService(reviewDir.dir, (state) => send('review:update', state))
    // Waits only for the review store to open, at most 8 seconds. The first snapshot runs in the background,
    // so a slow Git does not hold back the window.
    await review.setFolder(folder.folder)
    listener = await startHookListener((startKey, e) => {
      // The status goes out first: the review may hold the reply while it takes a snapshot.
      relay.hook(startKey, e)
      return review.hook(startKey, e)
    })
    hookDir = createHookDir()
  } catch (err) {
    // A window without status would show Idle while Claude waits, which is worse than no window.
    dialog.showErrorBox('Blueprint could not start', err instanceof Error ? err.message : String(err))
    // The cleanup below is not registered yet, so remove what was already made.
    void listener?.close()
    hookDir?.remove()
    reviewDir?.remove()
    app.quit()
    return
  }
  const saved = folder.folder
    ? readLayout(layoutFile(app.getPath('userData'), folder.folder))?.window
    : undefined
  win = createWindow(
    initialWindow(
      saved,
      screen.getAllDisplays().map((d) => d.workArea),
    ),
  )
  const manager = new TerminalManager({
    data: (tabId, data) => send('terminal:data', tabId, data),
    exit: (tabId, exit) => send('terminal:exit', tabId, exit),
  })
  const deps: IpcDeps = {
    folder,
    manager,
    relay,
    review,
    // The ipc module swaps in the Folder the Developer picks, so the notifier reads it through deps.
    notifier: new NeedsYouNotifier(
      win,
      () => basename(deps.folder.folder ?? ''),
      (tabId) => send('status:focus', tabId),
    ),
    hookSettingsFor: (startKey) =>
      writeHookSettings(hookDir.dir, startKey, hookSettings(`${listener.url}/${startKey}`, listener.token)),
  }
  registerIpc(win, deps, app.getPath('userData'))
  keepWindowBounds(win, () => deps.folder.folder, app.getPath('userData'))
  win.on('focus', () => void review.refresh())
  // Both events fire on quit, so the cleanup runs once.
  let cleaned = false
  const cleanUp = (): void => {
    manager.killAll()
    if (cleaned) return
    cleaned = true
    void listener.close()
    relay.close()
    hookDir.remove()
    review.close()
    reviewDir.remove()
  }
  // No terminal outlives the window: quitting ends every Claude session and shell.
  app.on('window-all-closed', () => {
    cleanUp()
    app.quit()
  })
  app.on('before-quit', cleanUp)
})

/** Saves the window's normal bounds 500 ms after the last move or resize, and at once on close. */
function keepWindowBounds(
  win: BrowserWindow,
  folder: () => string | null | undefined,
  userData: string,
): void {
  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    clearTimeout(timer)
    timer = undefined
    const open = folder()
    if (!open || win.isDestroyed()) return
    const bounds: WindowBounds = { ...win.getNormalBounds(), maximized: win.isMaximized() }
    try {
      writeLayout(layoutFile(userData, open), open, { window: bounds })
    } catch (err) {
      console.warn('Blueprint could not save the window bounds:', err)
    }
  }
  const later = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('move', later)
  win.on('resize', later)
  win.on('close', save)
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
