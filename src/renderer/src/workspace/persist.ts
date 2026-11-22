import type { DockviewApi, SerializedDockview } from 'dockview-react'
import { isClaudeTab, tabKind } from './sessions'

const SAVE_DELAY_MS = 500

function isSerialized(value: unknown): value is SerializedDockview {
  return typeof value === 'object' && value !== null && 'grid' in value && 'panels' in value
}

/** What each review panel must be: a saved layout whose panel of that id is something else is foreign. */
const EXPECTED: Record<string, { component: string; kind?: string }> = {
  changes: { component: 'changes' },
  difference: { component: 'difference' },
}

/** What a panel must be: a review panel, or a terminal of the kind its id names (`claude-<n>`, `shell-<n>`). */
function wanted(id: string): { component: string; kind?: string } | undefined {
  const kind = tabKind(id)
  return kind ? { component: 'terminal', kind } : EXPECTED[id]
}

function isExpected(api: DockviewApi, id: string): boolean {
  const want = wanted(id)
  const panel = api.getPanel(id)
  if (!want || !panel) return false
  const view = panel.api.component
  const params = panel.params as { kind?: unknown } | undefined
  return view === want.component && (want.kind === undefined || params?.kind === want.kind)
}

/**
 * Loads a saved layout. Gives `false`, with the dock cleared, when the JSON doesn't load, lacks
 * a Claude tab, or holds a panel that isn't a review pane, a Claude session or a shell; the caller then
 * adds the default panes.
 */
export function restoreLayout(api: DockviewApi, saved: unknown): boolean {
  try {
    if (!isSerialized(saved)) throw new Error('not a dockview layout')
    api.fromJSON(saved)
  } catch {
    api.clear()
    return false
  }
  if (!api.panels.some((p) => isClaudeTab(p.id)) || !api.panels.every((p) => isExpected(api, p.id))) {
    api.clear()
    return false
  }
  // dockview saves a zoomed layout with the zoom recorded apart from the sizes, and loads it zoomed.
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  return true
}

/**
 * Saves the layout 500 ms after the last change. dockview leaves a zoom before it serialises, so
 * the sizes saved are the unzoomed ones. A save still waiting when the window unloads or the
 * saving is disposed is sent at once.
 */
export function installLayoutSaving(api: DockviewApi): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = (): void => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    window.blueprint.saveLayout(api.toJSON())
  }
  const sub = api.onDidLayoutChange(() => {
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY_MS)
  })
  window.addEventListener('beforeunload', flush)
  return () => {
    flush()
    window.removeEventListener('beforeunload', flush)
    sub.dispose()
  }
}
