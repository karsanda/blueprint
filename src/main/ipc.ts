import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { type BrowserWindow, clipboard, dialog, ipcMain, screen } from 'electron'
import type {
  FileDiff,
  FolderState,
  ReviewView,
  SavedConversation,
  StartFailure,
  StartRequest,
  StartResult,
} from '../shared/api'
import { holdFolder, lockFile, releaseFolder } from './layout/lock'
import { initialWindow, layoutFile, readLayout, writeLayout } from './layout/store'
import type { NeedsYouNotifier } from './notify'
import { keptReviewDir } from './review/kept'
import type { ReviewService } from './review/service'
import type { StatusRelay } from './status/relay'
import type { TerminalManager } from './terminal/manager'
import { claudeSettingsFiles, hooksBlockedBy, managedSettingsDir } from './status/blocked'
import { resumable } from './terminal/resume'
import { claudeSpec, type SpawnSpec, shellSpec } from './terminal/spec'

export interface IpcDeps {
  folder: FolderState
  /**
   * Whether this Blueprint holds the Folder. Another one that opened it first keeps its conversations and
   * its layout file, so this one resumes nothing and saves no layout.
   */
  holdsFolder: boolean
  manager: TerminalManager
  relay: StatusRelay
  notifier: NeedsYouNotifier
  review: ReviewService
  /** Tells the renderer which conversation a Claude tab is in: the resumed one, or null for a new one. */
  sendConversation: (tabId: string, conversation: SavedConversation | null) => void
  /** Writes the Claude Code settings that carry Blueprint's hooks for one start, and returns the file. */
  hookSettingsFor: (startKey: string) => string
  /** The address Blueprint's hooks post to for one start. */
  hookUrlFor: (startKey: string) => string
}

/** Registers the channels behind `window.blueprint`. Blueprint has one window, so this runs once. */
export function registerIpc(win: BrowserWindow, deps: IpcDeps, userData: string): void {
  ipcMain.handle('folder:get', (): FolderState => deps.folder)
  ipcMain.handle('folder:pick', async (): Promise<FolderState> => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    const picked = result.canceled ? undefined : result.filePaths[0]
    if (picked) {
      const before = deps.folder.folder
      if (before && deps.holdsFolder) releaseFolder(lockFile(userData, before), process.pid)
      deps.folder = { folder: picked }
      deps.holdsFolder = holdFolder(userData, picked)
      await deps.review.setFolder(picked, deps.holdsFolder ? keptReviewDir(userData, picked) : undefined)
      // The window goes to this Folder's place; closing it then saves the bounds back to the same Folder.
      const start = initialWindow(
        readLayout(layoutFile(userData, picked))?.window,
        screen.getAllDisplays().map((d) => d.workArea),
      )
      if (start.bounds) {
        if (win.isMaximized()) win.unmaximize()
        win.setBounds(start.bounds)
      }
      if (start.maximized) win.maximize()
    }
    return deps.folder
  })

  ipcMain.handle('terminal:start', (_e, req: StartRequest): Promise<StartResult> => startTerminal(deps, req))
  ipcMain.on('terminal:stop', (_e, tabId: string) => {
    deps.manager.kill(tabId)
    deps.relay.unregister(tabId)
    deps.review.endSession(tabId)
    deps.notifier.forget(tabId)
  })
  ipcMain.handle('terminal:foreground', (_e, tabId: string): Promise<string | null> =>
    deps.manager.foreground(tabId),
  )
  ipcMain.on('terminal:write', (_e, tabId: string, data: string) => deps.manager.write(tabId, data))
  ipcMain.on('terminal:resize', (_e, tabId: string, cols: number, rows: number) =>
    deps.manager.resize(tabId, cols, rows),
  )

  ipcMain.on('status:notify', (_e, tabId: string, tabTitle: string) => deps.notifier.notify(tabId, tabTitle))

  ipcMain.on('review:view', (_e, view: ReviewView) => deps.review.setView(view))
  ipcMain.handle('review:diff', (_e, path: string): Promise<FileDiff> => deps.review.diff(path))

  ipcMain.handle('layout:get', (): unknown => {
    const folder = deps.folder.folder
    return folder ? (readLayout(layoutFile(userData, folder))?.dockview ?? null) : null
  })
  ipcMain.on('layout:save', (_e, dockview: unknown) => {
    const folder = deps.folder.folder
    if (!folder || !deps.holdsFolder) return
    try {
      writeLayout(layoutFile(userData, folder), folder, { dockview })
    } catch (err) {
      console.warn('Blueprint could not save the layout:', err)
    }
  })

  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('clipboard:read', async (): Promise<string> => clipboard.readText())
}

async function startTerminal(deps: IpcDeps, req: StartRequest): Promise<StartResult> {
  const folder = deps.folder.folder
  if (!folder) return { ok: false, failure: { reason: 'spawn-failed', message: 'No Folder is open.' } }
  // Only a conversation whose transcript is still on disk can be resumed; anything else starts a new one.
  // A Folder another Blueprint holds resumes nothing: that one already runs its conversations.
  const heldElsewhere = req.kind === 'claude' && req.resume !== undefined && !deps.holdsFolder
  const resume =
    req.kind === 'claude' && !heldElsewhere && resumable(req.resume, existsSync) ? req.resume : undefined
  // The start key, not the session id, routes hooks to the tab: `/clear` changes the session id.
  const startKey = randomUUID()
  let spec: SpawnSpec | StartFailure
  if (req.kind === 'claude') {
    try {
      spec = claudeSpec(
        folder,
        process.env,
        resume ? { resume: resume.sessionId } : { sessionId: randomUUID() },
        deps.hookSettingsFor(startKey),
      )
    } catch (err) {
      return { ok: false, failure: { reason: 'spawn-failed', message: errorMessage(err) } }
    }
  } else {
    spec = shellSpec(folder, process.env)
  }
  if ('reason' in spec) return { ok: false, failure: spec }
  if (req.kind === 'claude') {
    deps.relay.register(req.tabId, startKey)
    try {
      // The session base comes before Claude's first edit, unless Git takes longer than the 8-second wait.
      await deps.review.startSession(req.tabId, startKey, resume?.sessionId)
    } catch (err) {
      // Claude is worth more than its review: start it without one.
      console.warn('Review could not start a session:', err)
    }
    // The tab may have closed (or started again) while the review was starting: spawn nothing for it.
    if (deps.relay.currentKey(req.tabId) !== startKey) {
      if (deps.relay.currentKey(req.tabId) === undefined) deps.review.endSession(req.tabId)
      return { ok: false, failure: { reason: 'spawn-failed', message: 'The tab was closed.' } }
    }
  }
  try {
    const pid = deps.manager.start(req.tabId, spec, req.cols, req.rows)
    if (req.kind === 'claude')
      deps.sendConversation(
        req.tabId,
        resume ? { sessionId: resume.sessionId, transcript: resume.transcript } : null,
      )
    if (req.kind !== 'claude') return { ok: true, pid }
    // Settings that stop the hooks leave the status and the review blind: the pane says why.
    const files = claudeSettingsFiles(folder, process.env, managedSettingsDir(process.platform))
    const blocked = hooksBlockedBy(files, deps.hookUrlFor(startKey))
    const hooks = blocked ? { hooksBlocked: blocked } : {}
    if (req.resume === undefined) return { ok: true, pid, ...hooks }
    return heldElsewhere
      ? { ok: true, pid, resumed: false, heldElsewhere: true, ...hooks }
      : { ok: true, pid, resumed: resume !== undefined, ...hooks }
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
