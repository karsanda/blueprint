import type { DockviewApi, DockviewGroupPanel } from 'dockview-react'
import type { TerminalKind } from '../../../shared/api'
import { focusTab } from '../status/notify'
import { useClaudeStatus } from '../status/store'
import { findSession } from '../terminal/session'
import { useTerminalStatus } from '../terminal/status'

const TERMINAL_TAB = /^(claude|shell)-(\d+)$/
const TITLE: Record<TerminalKind, string> = { claude: 'Claude', shell: 'Shell' }

/** The kind of terminal a tab id names: `claude-<n>` or `shell-<n>`; undefined for any other tab. */
export function tabKind(id: string): TerminalKind | undefined {
  const kind = TERMINAL_TAB.exec(id)?.[1]
  return kind === 'claude' || kind === 'shell' ? kind : undefined
}

/** A terminal tab's number, or 0 for a tab of another kind. */
function numberOf(kind: TerminalKind, id: string): number {
  const match = TERMINAL_TAB.exec(id)
  return match?.[1] === kind ? Number(match[2]) : 0
}

/**
 * The tab a new terminal of `kind` takes: one number past the highest open tab of that kind and past
 * every number of that kind used earlier in this run, so a closed tab's number is never reissued.
 */
export function nextTab(
  kind: TerminalKind,
  ids: string[],
  highestUsed: number,
): { id: string; title: string } {
  const n = Math.max(highestUsed, ...ids.map((id) => numberOf(kind, id))) + 1
  return { id: `${kind}-${n}`, title: `${TITLE[kind]} ${n}` }
}

/** The highest number of each kind this run has opened or closed, restored tabs included. */
const highestUsed: Record<TerminalKind, number> = { claude: 0, shell: 0 }
function noteUsed(id: string): void {
  const kind = tabKind(id)
  if (kind) highestUsed[kind] = Math.max(highestUsed[kind], numberOf(kind, id))
}

export function isClaudeTab(id: string): boolean {
  return tabKind(id) === 'claude'
}

export function isShellTab(id: string): boolean {
  return tabKind(id) === 'shell'
}

/** Opens a new terminal of `kind` as the active tab of `group`, with the cursor in it. */
export function openTab(api: DockviewApi, group: DockviewGroupPanel, kind: TerminalKind): void {
  const { id, title } = nextTab(
    kind,
    api.panels.map((p) => p.id),
    highestUsed[kind],
  )
  api.addPanel({
    id,
    component: 'terminal',
    title,
    params: { kind },
    renderer: 'always',
    position: { referenceGroup: group },
  })
  noteUsed(id)
  focusTab(api, id)
}

/** Closes a Claude or shell tab: its pane, its terminal view, its program, and its status. */
export function closeTab(api: DockviewApi, tabId: string): void {
  const kind = tabKind(tabId)
  // The last tab of each kind stays.
  if (!kind || api.panels.filter((p) => tabKind(p.id) === kind).length <= 1) return
  noteUsed(tabId)
  const panel = api.getPanel(tabId)
  const hadFocus = panel?.api.isActive === true
  if (panel) api.removePanel(panel)
  findSession(tabId)?.dispose()
  window.blueprint.stopTerminal(tabId)
  if (kind === 'claude') useClaudeStatus.getState().set(tabId, undefined)
  useTerminalStatus.getState().clear(tabId)
  // The terminal tab that takes its place gets the keyboard.
  const next = hadFocus ? api.activePanel : undefined
  if (next && tabKind(next.id)) focusTab(api, next.id)
}
