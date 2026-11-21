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

export interface StartRequest {
  tabId: string
  kind: TerminalKind
  cols: number
  rows: number
}

export type StartResult = { ok: true; pid: number } | { ok: false; failure: StartFailure }

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

/** The API the preload script exposes to the renderer as `window.blueprint`. */
export interface BlueprintApi {
  /** True when e2e tests run the app (BLUEPRINT_E2E=1). */
  e2e: boolean
  getFolder(): Promise<FolderState>
  pickFolder(): Promise<FolderState>
  startTerminal(req: StartRequest): Promise<StartResult>
  write(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  onData(tabId: string, cb: (data: string) => void): () => void
  onExit(tabId: string, cb: (exit: ExitInfo) => void): () => void
  writeClipboard(text: string): void
}
