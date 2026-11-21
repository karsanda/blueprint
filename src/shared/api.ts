/** The Folder Blueprint is open on, or why there is none. */
export interface FolderState {
  folder: string | null
  problem?: string
}

/** The API the preload script exposes to the renderer as `window.blueprint`. */
export interface BlueprintApi {
  getFolder(): Promise<FolderState>
  pickFolder(): Promise<FolderState>
}

export type TerminalKind = 'claude' | 'shell'

/** Why a terminal could not start, in words for the Developer. */
export type StartFailure =
  | { reason: 'not-installed'; message: string; fix: string }
  | { reason: 'spawn-failed'; message: string }
