import { type BrowserWindow, dialog, ipcMain } from 'electron'
import type { FolderState } from '../shared/api'

export interface IpcDeps {
  folder: FolderState
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
}
