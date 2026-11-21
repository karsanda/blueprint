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
