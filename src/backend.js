// PROTOTYPE: one backend API, two shells.
// Electron: main.cjs + preload.cjs expose window.blueprintBackend.
// Tauri:    src-tauri/src/main.rs exposes commands; this file wraps them in the same shape.

function tauriBackend() {
  const T = window.__TAURI__;
  const { invoke, Channel } = T.core;
  const dataH = [], exitH = [], hookH = [];
  T.event.listen('hook', (e) => hookH.forEach((h) => h(e.payload)));
  return {
    name: 'tauri',
    info: () => invoke('info'),
    ptySpawn: ({ id, kind, cols, rows }) => {
      const onData = new Channel();
      onData.onmessage = (s) => dataH.forEach((h) => h(id, s));
      const onExit = new Channel();
      onExit.onmessage = (code) => exitH.forEach((h) => h(id, code));
      return invoke('pty_spawn', { id, kind, cols, rows, onData, onExit });
    },
    ptyWrite: (id, data) => { invoke('pty_write', { id, data }); },
    ptyResize: (id, cols, rows) => { invoke('pty_resize', { id, cols, rows }); },
    ptyKill: (id) => { invoke('pty_kill', { id }); },
    onPtyData: (h) => { dataH.push(h); },
    onPtyExit: (h) => { exitH.push(h); },
    onHook: (h) => { hookH.push(h); },
    gitSnapshot: () => invoke('git_snapshot'),
    gitChanges: (base) => invoke('git_changes', { base }),
    gitDiff: (base, now, path) => invoke('git_diff', { base, now, path }),
    metrics: () => invoke('metrics'),
    selftestHook: () => invoke('selftest_hook'),
    report: (results) => invoke('report', { results }),
  };
}

export const backend = window.__TAURI__ ? tauriBackend() : window.blueprintBackend;
