import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  BlueprintApi,
  ExitInfo,
  FolderState,
  ReviewState,
  StartRequest,
  StartResult,
  StatusSignal,
} from '../shared/api'

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
  onStatusSignal: (cb) => {
    const listener = (_e: IpcRendererEvent, tabId: string, signal: StatusSignal): void => cb(tabId, signal)
    ipcRenderer.on('status:signal', listener)
    return () => {
      ipcRenderer.off('status:signal', listener)
    }
  },
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),
  notify: (tabId, tabTitle) => ipcRenderer.send('status:notify', tabId, tabTitle),
  onFocusTab: (cb) => {
    const listener = (_e: IpcRendererEvent, tabId: string): void => cb(tabId)
    ipcRenderer.on('status:focus', listener)
    return () => {
      ipcRenderer.off('status:focus', listener)
    }
  },
  onReviewUpdate: (cb) => {
    const listener = (_e: IpcRendererEvent, state: ReviewState): void => cb(state)
    ipcRenderer.on('review:update', listener)
    return () => {
      ipcRenderer.off('review:update', listener)
    }
  },
  setReviewView: (view) => ipcRenderer.send('review:view', view),
  reviewDiff: (path) => ipcRenderer.invoke('review:diff', path),
  getLayout: (): Promise<unknown> => ipcRenderer.invoke('layout:get'),
  saveLayout: (layout) => ipcRenderer.send('layout:save', layout),
}

contextBridge.exposeInMainWorld('blueprint', api)
