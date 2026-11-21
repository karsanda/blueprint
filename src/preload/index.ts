import { contextBridge, ipcRenderer } from 'electron'
import type { BlueprintApi, FolderState } from '../shared/api'

const api: BlueprintApi = {
  getFolder: (): Promise<FolderState> => ipcRenderer.invoke('folder:get'),
  pickFolder: (): Promise<FolderState> => ipcRenderer.invoke('folder:pick'),
}

contextBridge.exposeInMainWorld('blueprint', api)
