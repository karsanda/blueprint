import type { DockviewApi } from 'dockview-react'

function cut(win: Window | null): void {
  if (win) win.opener = null
}

/**
 * Cuts each pop-out window's link back to the main window. The main window draws into a pop-out and never
 * needs the reverse; without the link, script in a pop-out's page cannot reach the main window's API.
 * Installed before the layout loads, so pop-out windows it restores are cut too.
 */
export function installPopoutIsolation(api: DockviewApi): void {
  for (const p of api.getPopouts()) cut(p.window)
  api.onDidAddPopoutGroup((p) => cut(p.window))
}
