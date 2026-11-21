// PROTOTYPE — exposes the Electron backend with the same shape as src/backend.js's Tauri adapter.
const { contextBridge, ipcRenderer } = require('electron');
const dataH = [], exitH = [], hookH = [];
ipcRenderer.on('pty:data', (_e, id, d) => dataH.forEach((h) => h(id, d)));
ipcRenderer.on('pty:exit', (_e, id, c) => exitH.forEach((h) => h(id, c)));
ipcRenderer.on('hook', (_e, evt) => hookH.forEach((h) => h(evt)));
contextBridge.exposeInMainWorld('blueprintBackend', {
  name: 'electron',
  info: () => ipcRenderer.invoke('info'),
  ptySpawn: (o) => ipcRenderer.invoke('pty:spawn', o),
  ptyWrite: (id, d) => ipcRenderer.send('pty:write', id, d),
  ptyResize: (id, c, r) => ipcRenderer.send('pty:resize', id, c, r),
  ptyKill: (id) => ipcRenderer.send('pty:kill', id),
  onPtyData: (h) => { dataH.push(h); },
  onPtyExit: (h) => { exitH.push(h); },
  onHook: (h) => { hookH.push(h); },
  gitSnapshot: () => ipcRenderer.invoke('git:snapshot'),
  gitChanges: (base) => ipcRenderer.invoke('git:changes', base),
  gitDiff: (base, now, file) => ipcRenderer.invoke('git:diff', base, now, file),
  metrics: () => ipcRenderer.invoke('metrics'),
  selftestHook: () => ipcRenderer.invoke('selftest:hook'),
  report: (r) => ipcRenderer.invoke('report', r),
});
