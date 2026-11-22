import type { DockviewApi, DockviewGroupPanel } from 'dockview-react'
import { focusTab } from '../status/notify'
import { type WorkspaceAction, workspaceKeyAction } from '../terminal/keys'
import { findSession } from '../terminal/session'
import { applyPreset } from './presets'
import { openTab, tabKind } from './sessions'

/** Makes a tab the active one and gives it the keyboard; a pane without a terminal takes it from the old one. */
function giveKeyboard(api: DockviewApi, tabId: string): void {
  focusTab(api, tabId)
  if (findSession(tabId)) return
  const doc = api.getPanel(tabId)?.group.element.ownerDocument
  const active = doc?.activeElement
  if (active && 'blur' in active && typeof active.blur === 'function') active.blur()
}

/**
 * Carries out a workspace key on the dock, from the pane `from` (the one whose terminal has the
 * keyboard), or else from dockview's active pane.
 */
export function runWorkspaceAction(
  api: DockviewApi,
  action: WorkspaceAction,
  from?: DockviewGroupPanel,
): void {
  const group = from ?? api.activeGroup
  switch (action.kind) {
    case 'focus': {
      const target = group && api.adjacentGroupInDirection(group, action.direction)
      if (target?.activePanel) giveKeyboard(api, target.activePanel.id)
      return
    }
    case 'move': {
      const panel = group?.activePanel
      const adjacent = group && api.adjacentGroupInDirection(group, action.direction)
      // moveTo takes the group object dockview keeps, which `groups` lists.
      const target = adjacent && api.groups.find((g) => g.id === adjacent.id)
      if (!panel || !target) return
      panel.api.moveTo({ group: target, position: 'center' })
      giveKeyboard(api, panel.id)
      return
    }
    case 'next-tab':
    case 'previous-tab': {
      const panels = group?.panels ?? []
      const at = panels.findIndex((p) => p.id === group?.activePanel?.id)
      if (at < 0 || panels.length < 2) return
      const step = action.kind === 'next-tab' ? 1 : -1
      const next = panels[(at + step + panels.length) % panels.length]
      if (next) giveKeyboard(api, next.id)
      return
    }
    case 'new': {
      const holds = (g: DockviewGroupPanel) => g.panels.some((p) => tabKind(p.id) === action.tab)
      const target = group && holds(group) ? group : api.groups.find(holds)
      if (target) openTab(api, target, action.tab)
      return
    }
    case 'zoom':
      if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
      else group?.api.maximize()
      return
    case 'preset':
      applyPreset(api, action.preset)
      return
  }
}

/** The pane whose terminal has the keyboard in `win`; dockview may not have made it active yet. */
function groupWithKeyboard(api: DockviewApi, win: Window): DockviewGroupPanel | undefined {
  const focused = win.document.activeElement
  return api.panels.find((p) => focused && findSession(p.id)?.term.textarea === focused)?.group
}

/**
 * Listens for workspace keys on the main window and on every pop-out window, whichever element has the
 * keyboard, terminals included. A handled key stops there, in the capture phase, so it never reaches the
 * terminal or its program. Keys typed in a tab's rename field stay in it. Returns the uninstall.
 */
export function installKeys(api: DockviewApi): () => void {
  const listen = (win: Window): (() => void) => {
    const onKey = (e: KeyboardEvent): void => {
      if (win.document.activeElement?.classList.contains('bp-tab-name')) return
      const action = workspaceKeyAction(e)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      runWorkspaceAction(api, action, groupWithKeyboard(api, win))
    }
    win.addEventListener('keydown', onKey, true)
    return () => win.removeEventListener('keydown', onKey, true)
  }
  const offs = [listen(window), ...api.getPopouts().map((p) => listen(p.window))]
  const sub = api.onDidAddPopoutGroup((p) => offs.push(listen(p.window)))
  return () => {
    sub.dispose()
    for (const off of offs) off()
  }
}
