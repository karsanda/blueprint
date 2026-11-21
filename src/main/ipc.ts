import { randomUUID } from 'node:crypto'
import { type BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import type { FolderState, StartFailure, StartRequest, StartResult } from '../shared/api'
import type { NeedsYouNotifier } from './notify'
import type { StatusRelay } from './status/relay'
import type { TerminalManager } from './terminal/manager'
import { claudeSpec, type SpawnSpec, shellSpec } from './terminal/spec'

export interface IpcDeps {
  folder: FolderState
  manager: TerminalManager
  relay: StatusRelay
  notifier: NeedsYouNotifier
  /** Writes the Claude Code settings that carry Blueprint's hooks for one start, and returns the file. */
  hookSettingsFor: (startKey: string) => string
}

/** Registers the channels behind `window.blueprint`. Blueprint has one window, so this runs once. */
export function registerIpc(win: BrowserWindow, deps: IpcDeps): void {
  ipcMain.handle('folder:get', (): FolderState => deps.folder)
  ipcMain.handle('folder:pick', async (): Promise<FolderState> => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    const picked = result.canceled ? undefined : result.filePaths[0]
    if (picked) deps.folder = { folder: picked }
    return deps.folder
  })

  ipcMain.handle('terminal:start', (_e, req: StartRequest): StartResult => startTerminal(deps, req))
  ipcMain.on('terminal:write', (_e, tabId: string, data: string) => deps.manager.write(tabId, data))
  ipcMain.on('terminal:resize', (_e, tabId: string, cols: number, rows: number) =>
    deps.manager.resize(tabId, cols, rows),
  )

  ipcMain.on('status:notify', (_e, tabId: string, tabTitle: string) => deps.notifier.notify(tabId, tabTitle))

  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text))
}

function startTerminal(deps: IpcDeps, req: StartRequest): StartResult {
  const folder = deps.folder.folder
  if (!folder) return { ok: false, failure: { reason: 'spawn-failed', message: 'No Folder is open.' } }
  // Each Claude start is a new conversation; resuming one comes with a later slice.
  const sessionId = randomUUID()
  // The start key, not the session id, routes hooks to the tab: `/clear` changes the session id.
  const startKey = randomUUID()
  let spec: SpawnSpec | StartFailure
  if (req.kind === 'claude') {
    try {
      spec = claudeSpec(folder, process.env, sessionId, deps.hookSettingsFor(startKey))
    } catch (err) {
      return { ok: false, failure: { reason: 'spawn-failed', message: errorMessage(err) } }
    }
  } else {
    spec = shellSpec(folder, process.env)
  }
  if ('reason' in spec) return { ok: false, failure: spec }
  if (req.kind === 'claude') deps.relay.register(req.tabId, startKey)
  try {
    return { ok: true, pid: deps.manager.start(req.tabId, spec, req.cols, req.rows) }
  } catch (err) {
    return {
      ok: false,
      failure: { reason: 'spawn-failed', message: errorMessage(err) },
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
