import type { DockviewApi } from 'dockview-react'
import { isClaudeTab } from '../workspace/sessions'
import { useReview } from './store'

/** Feeds the review main pushes into the store. */
export function installReview(): void {
  window.blueprint.onReviewUpdate((state) => useReview.getState().receive(state))
  window.blueprint.onOverlaps((overlaps) => useReview.getState().setOverlaps(overlaps))
}

/** Keeps the store's session names and shown session in step with the Claude tabs. Returns the unsubscribe. */
export function installReviewFollow(api: DockviewApi): () => void {
  const store = useReview.getState()
  const open = () => api.panels.filter((p) => isClaudeTab(p.id))
  const syncNames = () => store.setNames(Object.fromEntries(open().map((p) => [p.id, p.title ?? p.id])))
  syncNames()
  const active = api.activePanel
  if (active && isClaudeTab(active.id)) store.focusTab(active.id)
  else if (!open().some((p) => p.id === useReview.getState().shownTab)) {
    const first = open()[0]
    if (first) store.focusTab(first.id)
  }
  const subs = [
    api.onDidAddPanel(syncNames),
    api.onDidLayoutChange(syncNames),
    api.onDidActivePanelChange((e) => {
      if (e.panel && isClaudeTab(e.panel.id)) store.focusTab(e.panel.id)
    }),
    api.onDidRemovePanel((p) => {
      if (isClaudeTab(p.id))
        store.closeTab(
          p.id,
          open().map((o) => o.id),
        )
    }),
  ]
  return () => subs.forEach((s) => s.dispose())
}
