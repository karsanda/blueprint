import type { DockviewApi } from 'dockview-react'

/** The panels Blueprint knows. A saved layout naming any other panel is not one Blueprint wrote. */
export const DEFAULT_PANEL_IDS = ['claude-1', 'shell-1', 'changes', 'difference']

/**
 * Adds each default pane that is missing, where the default layout puts it: Changes on the left at
 * full height, Claude and Difference side by side, and a shell below them both. A restored layout
 * keeps the panes it has.
 */
export function addDefaultPanels(api: DockviewApi): void {
  const fresh = !api.getPanel('claude-1')
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
      position: { referencePanel: 'claude-1', direction: 'below' },
    })
  }
  if (!api.getPanel('difference')) {
    api.addPanel({
      id: 'difference',
      component: 'difference',
      title: 'Difference',
      position: { referencePanel: 'claude-1', direction: 'right' },
    })
  }
  if (fresh) api.getPanel('claude-1')?.api.setActive()
}
