import type { DockviewApi, DockviewGroupPanel } from 'dockview-react'
import { focusTab } from '../status/notify'
import { useClaudeStatus } from '../status/store'
import { findSession } from '../terminal/session'
import { useTerminalStatus } from '../terminal/status'

const CLAUDE_TAB = /^claude-(\d+)$/

/**
 * The tab a new Claude session takes: one number past the highest open Claude tab and past every
 * number used earlier in this run, so a closed session's number is never reissued.
 */
export function nextClaudeTab(ids: string[], highestUsed: number): { id: string; title: string } {
  const open = ids.map((id) => Number(CLAUDE_TAB.exec(id)?.[1] ?? 0))
  const n = Math.max(highestUsed, ...open) + 1
  return { id: `claude-${n}`, title: `Claude ${n}` }
}

/** The highest Claude number this run has opened or closed, restored tabs included. */
let highestUsed = 0
function noteUsed(id: string): void {
  highestUsed = Math.max(highestUsed, Number(CLAUDE_TAB.exec(id)?.[1] ?? 0))
}

export function isClaudeTab(id: string): boolean {
  return CLAUDE_TAB.test(id)
}

/** Opens a new Claude session as the active tab of `group`, with the cursor in it. */
export function openClaudeSession(api: DockviewApi, group: DockviewGroupPanel): void {
  const { id, title } = nextClaudeTab(
    api.panels.map((p) => p.id),
    highestUsed,
  )
  api.addPanel({
    id,
    component: 'terminal',
    title,
    params: { kind: 'claude' },
    renderer: 'always',
    position: { referenceGroup: group },
  })
  noteUsed(id)
  focusTab(api, id)
}

/** Closes a Claude tab: its pane, its terminal view, its program, and its status. */
export function closeClaudeSession(api: DockviewApi, tabId: string): void {
  // The last Claude tab stays.
  if (api.panels.filter((p) => isClaudeTab(p.id)).length <= 1) return
  noteUsed(tabId)
  const panel = api.getPanel(tabId)
  const hadFocus = panel?.api.isActive === true
  if (panel) api.removePanel(panel)
  findSession(tabId)?.dispose()
  window.blueprint.stopTerminal(tabId)
  useClaudeStatus.getState().set(tabId, undefined)
  useTerminalStatus.getState().clear(tabId)
  // The Claude tab that takes its place gets the keyboard.
  const next = hadFocus ? api.activePanel : undefined
  if (next && isClaudeTab(next.id)) focusTab(api, next.id)
}
