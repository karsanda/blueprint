import type { DockviewApi } from 'dockview-react'

/** The layout a Folder opens in: a Claude session on the left, a shell on the right. */
export function addDefaultPanels(api: DockviewApi): void {
  if (api.getPanel('claude-1')) return
  api.addPanel({
    id: 'claude-1',
    component: 'terminal',
    title: 'Claude',
    params: { kind: 'claude' },
    renderer: 'always',
  })
  api.addPanel({
    id: 'shell-1',
    component: 'terminal',
    title: 'Shell',
    params: { kind: 'shell' },
    renderer: 'always',
    position: { referencePanel: 'claude-1', direction: 'right' },
  })
}
