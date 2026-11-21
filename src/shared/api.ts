/** The Folder Blueprint is open on, or why there is none. */
export interface FolderState {
  folder: string | null
  problem?: string
}

export type TerminalKind = 'claude' | 'shell'

/** Why a terminal could not start, in words for the Developer. */
export type StartFailure =
  | { reason: 'not-installed'; message: string; fix: string }
  | { reason: 'spawn-failed'; message: string }

/** The conversation a Claude tab continues: Claude Code's session id and its transcript file. */
export interface SavedConversation {
  sessionId: string
  transcript: string
}

export interface StartRequest {
  tabId: string
  kind: TerminalKind
  cols: number
  rows: number
  /** The tab's saved conversation, on its first start in a run only; main checks it. */
  resume?: SavedConversation
}

export type StartResult =
  | { ok: true; pid: number; /** Present only when the request had `resume`. */ resumed?: boolean }
  | { ok: false; failure: StartFailure }

/** How a terminal's program ended. `signal` is present only when a signal ended it. */
export interface ExitInfo {
  exitCode: number
  signal?: number
}

export type ClaudeStatus = 'idle' | 'working' | 'needs-you'

/** What Blueprint learned about a Claude session. The renderer folds it into a ClaudeStatus. */
export type StatusSignal =
  | { kind: 'prompt' } // UserPromptSubmit
  | { kind: 'asks' } // PermissionRequest, or Notification permission_prompt / elicitation_dialog
  | { kind: 'tool-done' } // PostToolUse
  | { kind: 'stop' } // Stop
  | { kind: 'interrupted' } // the transcript gained an interrupt line
  | { kind: 'typed' } // the Developer typed a key in the pane (renderer only)

/** A Folder's window: the normal bounds, and whether it was maximized. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export type ReviewRange = 'turn' | 'session'
/** The Changes pane's range, and whether the Developer can see the pane. */
export interface ReviewView {
  range: ReviewRange
  visible: boolean
  /** The Claude tab the Changes pane shows. */
  tabId: string | null
}
/** A Change as the review lists it. The path is relative to the Folder, with `/`. Counts are 0 for a binary file. */
export interface Change {
  path: string
  /** Git's id of the file's content: the new content, or the removed content for a deleted file. */
  id: string
  kind: 'added' | 'modified' | 'deleted'
  added: number
  removed: number
  binary: boolean
  /** Tab ids of the Claude sessions that made it, in the order they first touched it. Empty: changed outside Claude. */
  by: string[]
}
/** Two or more open sessions touched the same paths. */
export interface Overlap {
  tabId: string
  /** Tab ids. */
  others: string[]
  paths: string[]
}
export type ReviewState =
  | { kind: 'no-git'; message: string }
  | { kind: 'waiting'; message: string }
  | { kind: 'changes'; range: ReviewRange; changes: Change[] }
export type FileDiff =
  | { kind: 'text'; patch: string; byClaude: boolean }
  | { kind: 'binary' }
  | { kind: 'none' }

/** The API the preload script exposes to the renderer as `window.blueprint`. */
export interface BlueprintApi {
  /** True when e2e tests run the app (BLUEPRINT_E2E=1). */
  e2e: boolean
  getFolder(): Promise<FolderState>
  pickFolder(): Promise<FolderState>
  startTerminal(req: StartRequest): Promise<StartResult>
  /** Ends a closed tab's program and makes main forget its start key and session. */
  stopTerminal(tabId: string): void
  write(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  onData(tabId: string, cb: (data: string) => void): () => void
  onExit(tabId: string, cb: (exit: ExitInfo) => void): () => void
  /** Every status signal main learned about any Claude session, with the tab it belongs to. */
  onStatusSignal(cb: (tabId: string, signal: StatusSignal) => void): () => void
  writeClipboard(text: string): void
  /** Asks for a desktop notification that a session needs the Developer. */
  notify(tabId: string, tabTitle: string): void
  /** Main asks to bring a session forward, after the Developer clicked its notification. */
  onFocusTab(cb: (tabId: string) => void): () => void
  /** Every state the review reaches, as the Changes pane should show it. */
  onReviewUpdate(cb: (state: ReviewState) => void): () => void
  /** Which open sessions changed the same files, pushed whenever it changes. */
  onOverlaps(cb: (overlaps: Overlap[]) => void): () => void
  /** The conversation a Claude tab is in, pushed after each start (null for a new one) and when a session first shows its transcript. */
  onConversation(cb: (tabId: string, conversation: SavedConversation | null) => void): () => void
  /** Tells main which range the Changes pane shows and whether the Developer can see it. */
  setReviewView(view: ReviewView): void
  /** The difference of one Change, by its path relative to the Folder. */
  reviewDiff(path: string): Promise<FileDiff>
  /** The saved dockview layout of the open Folder, or null when there is none. */
  getLayout(): Promise<unknown>
  /** Saves the dockview layout (`toJSON()`) for the open Folder. */
  saveLayout(layout: unknown): void
}
