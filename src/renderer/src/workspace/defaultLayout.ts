import type { DockviewApi } from 'dockview-react'

/**
 * The layout a Folder opens in: Changes on the left at full height, Claude and Difference side by
 * side, and a shell below them both.
 */
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
    id: 'changes',
    component: 'changes',
    title: 'Changes',
    initialWidth: 250,
    position: { referencePanel: 'claude-1', direction: 'left' },
  })
  api.addPanel({
    id: 'shell-1',
    component: 'terminal',
    title: 'Shell',
    params: { kind: 'shell' },
    renderer: 'always',
    position: { referencePanel: 'claude-1', direction: 'below' },
  })
  api.addPanel({
    id: 'difference',
    component: 'difference',
    title: 'Difference',
    position: { referencePanel: 'claude-1', direction: 'right' },
  })
  api.getPanel('claude-1')?.api.setActive()
}
