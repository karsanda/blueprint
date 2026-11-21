import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BlueprintApi, ExitInfo, FolderState, StartRequest, StartResult } from '../shared/api'

/** Subscribes to a main-to-renderer channel whose first argument is a tab id. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T names the channel's payload at each call site
function onTab<T>(channel: string, tabId: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, id: string, value: T): void => {
    if (id === tabId) cb(value)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api: BlueprintApi = {
  e2e: process.env['BLUEPRINT_E2E'] === '1',
  getFolder: (): Promise<FolderState> => ipcRenderer.invoke('folder:get'),
  pickFolder: (): Promise<FolderState> => ipcRenderer.invoke('folder:pick'),
  startTerminal: (req: StartRequest): Promise<StartResult> => ipcRenderer.invoke('terminal:start', req),
  write: (tabId, data) => ipcRenderer.send('terminal:write', tabId, data),
  resize: (tabId, cols, rows) => ipcRenderer.send('terminal:resize', tabId, cols, rows),
  onData: (tabId, cb) => onTab<string>('terminal:data', tabId, cb),
  onExit: (tabId, cb) => onTab<ExitInfo>('terminal:exit', tabId, cb),
  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),
}

contextBridge.exposeInMainWorld('blueprint', api)
