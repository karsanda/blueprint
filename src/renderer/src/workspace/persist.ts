import type { DockviewApi, SerializedDockview } from 'dockview-react'
import { DEFAULT_PANEL_IDS } from './defaultLayout'

const SAVE_DELAY_MS = 500

function isSerialized(value: unknown): value is SerializedDockview {
  return typeof value === 'object' && value !== null && 'grid' in value && 'panels' in value
}

/**
 * Loads a saved layout. Gives `false`, with the dock cleared, when the JSON doesn't load, lacks
 * Claude, or names a panel Blueprint doesn't know; the caller then adds the default panes.
 */
export function restoreLayout(api: DockviewApi, saved: unknown): boolean {
  try {
    if (!isSerialized(saved)) throw new Error('not a dockview layout')
    api.fromJSON(saved)
  } catch {
    api.clear()
    return false
  }
  if (!api.getPanel('claude-1') || api.panels.some((p) => !DEFAULT_PANEL_IDS.includes(p.id))) {
    api.clear()
    return false
  }
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  return true
}

/**
 * Saves the layout 500 ms after the last change, and never while a pane is zoomed: dockview hides
 * the other panes by giving them zero width, and that would be saved.
 */
export function installLayoutSaving(api: DockviewApi): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const sub = api.onDidLayoutChange(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!api.hasMaximizedGroup()) window.blueprint.saveLayout(api.toJSON())
    }, SAVE_DELAY_MS)
  })
  return () => {
    clearTimeout(timer)
    sub.dispose()
  }
}
