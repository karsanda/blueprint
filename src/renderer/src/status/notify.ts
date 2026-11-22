import type { DockviewApi } from 'dockview-react'
import { findSession } from '../terminal/session'
import { useClaudeStatus } from './store'

/** Brings a session forward: leaves another pane's zoom, shows its tab and puts the cursor in it. */
export function focusTab(api: DockviewApi, tabId: string): void {
  const panel = api.getPanel(tabId)
  if (!panel) return
  if (api.hasMaximizedGroup() && !panel.group.api.isMaximized()) api.exitMaximizedGroup()
  panel.api.setActive()
  // A session in a pop-out window brings that window forward.
  const location = panel.group.api.location
  if (location.type === 'popout') location.getWindow().focus()
  // The pane is hidden until dockview has laid out again, and a hidden terminal cannot take focus.
  requestAnimationFrame(() => findSession(tabId)?.term.focus())
}

/**
 * Asks main for a desktop notification each time a session turns Needs you, and focuses the
 * session when the Developer clicks it. Returns the unsubscribe.
 */
export function installNotifications(api: DockviewApi): () => void {
  const unsubscribe = useClaudeStatus.subscribe((state, prev) => {
    for (const [tabId, status] of Object.entries(state.tabs)) {
      if (status === 'needs-you' && prev.tabs[tabId] !== 'needs-you') {
        window.blueprint.notify(tabId, api.getPanel(tabId)?.title ?? tabId)
      }
    }
  })
  const offFocus = window.blueprint.onFocusTab((tabId) => focusTab(api, tabId))
  return () => {
    unsubscribe()
    offFocus()
  }
}
