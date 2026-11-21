import type { DockviewApi } from 'dockview-react'

/**
 * Adds each default pane that is missing, where the default layout puts it: Changes on the left at
 * full height, Claude and Difference side by side, and a shell below them both. A restored layout
 * keeps the panes it has.
 */
export function addDefaultPanels(api: DockviewApi): void {
  const fresh = !api.getPanel('claude-1')
  // Panes filled into a restored layout don't take the active tab or group from it.
  const inactive = !fresh
  if (fresh) {
    api.addPanel({
      id: 'claude-1',
      component: 'terminal',
      title: 'Claude',
      params: { kind: 'claude' },
      renderer: 'always',
    })
  }
  if (!api.getPanel('changes')) {
    api.addPanel({
      id: 'changes',
      component: 'changes',
      title: 'Changes',
      initialWidth: 250,
      inactive,
      position: { referencePanel: 'claude-1', direction: 'left' },
    })
  }
  if (!api.getPanel('shell-1')) {
    api.addPanel({
      id: 'shell-1',
      component: 'terminal',
      title: 'Shell',
      params: { kind: 'shell' },
      renderer: 'always',
      inactive,
      position: { referencePanel: 'claude-1', direction: 'below' },
    })
  }
  if (!api.getPanel('difference')) {
    api.addPanel({
      id: 'difference',
      component: 'difference',
      title: 'Difference',
      inactive,
      position: { referencePanel: 'claude-1', direction: 'right' },
    })
  }
  if (fresh) api.getPanel('claude-1')?.api.setActive()
}
