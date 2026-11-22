import type { DockviewApi } from 'dockview-react'
import { isClaudeTab, isShellTab } from './sessions'

/**
 * Adds each default pane that is missing, where the default layout puts it: Changes on the left at
 * full height, Claude and Difference side by side, and a shell below them both. A restored layout
 * keeps the panes it has; it gets a shell only when it has none.
 */
export function addDefaultPanels(api: DockviewApi): void {
  const firstClaude = api.panels.find((p) => isClaudeTab(p.id))
  const fresh = !firstClaude
  // Panes filled into a restored layout don't take the active tab or group from it.
  const inactive = !fresh
  // Missing panes go beside the first Claude tab, whichever number it has.
  const claudeId = firstClaude?.id ?? 'claude-1'
  if (fresh) {
    api.addPanel({
      id: claudeId,
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
      position: { referencePanel: claudeId, direction: 'left' },
    })
  }
  // A layout keeps its shells under any number: the first may have closed.
  if (!api.panels.some((p) => isShellTab(p.id))) {
    api.addPanel({
      id: 'shell-1',
      component: 'terminal',
      title: 'Shell',
      params: { kind: 'shell' },
      renderer: 'always',
      inactive,
      position: { referencePanel: claudeId, direction: 'below' },
    })
  }
  if (!api.getPanel('difference')) {
    api.addPanel({
      id: 'difference',
      component: 'difference',
      title: 'Difference',
      inactive,
      position: { referencePanel: claudeId, direction: 'right' },
    })
  }
  if (fresh) api.getPanel(claudeId)?.api.setActive()
}
