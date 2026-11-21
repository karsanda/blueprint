import type { DockviewApi, DockviewGroupPanel } from 'dockview-react'
import { focusTab } from '../status/notify'
import { useClaudeStatus } from '../status/store'
import { findSession } from '../terminal/session'

const CLAUDE_TAB = /^claude-(\d+)$/

/** The tab a new Claude session takes: one number past the highest open Claude tab. */
export function nextClaudeTab(ids: string[]): { id: string; title: string } {
  const highest = Math.max(0, ...ids.map((id) => Number(CLAUDE_TAB.exec(id)?.[1] ?? 0)))
  const n = highest + 1
  return { id: `claude-${n}`, title: `Claude ${n}` }
}

export function isClaudeTab(id: string): boolean {
  return CLAUDE_TAB.test(id)
}

/** Opens a new Claude session as the active tab of `group`, with the cursor in it. */
export function openClaudeSession(api: DockviewApi, group: DockviewGroupPanel): void {
  const { id, title } = nextClaudeTab(api.panels.map((p) => p.id))
  api.addPanel({
    id,
    component: 'terminal',
    title,
    params: { kind: 'claude' },
    renderer: 'always',
    position: { referenceGroup: group },
  })
  focusTab(api, id)
}

/** Closes a Claude tab: its pane, its terminal view, its program, and its status. */
export function closeClaudeSession(api: DockviewApi, tabId: string): void {
  const panel = api.getPanel(tabId)
  if (panel) api.removePanel(panel)
  findSession(tabId)?.dispose()
  window.blueprint.stopTerminal(tabId)
  useClaudeStatus.getState().set(tabId, undefined)
}
