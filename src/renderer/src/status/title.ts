import type { DockviewApi } from 'dockview-react'
import { windowTitle } from '../../../shared/status'
import { useClaudeStatus } from './store'

/** Keeps the window title naming the sessions that need the Developer. Returns the unsubscribe. */
export function installTitle(api: DockviewApi): () => void {
  const update = () => {
    const { tabs } = useClaudeStatus.getState()
    const waiting = api.panels.filter((p) => tabs[p.id] === 'needs-you').map((p) => p.title ?? p.id)
    document.title = windowTitle(waiting)
  }
  update()
  const stop = useClaudeStatus.subscribe(update)
  // dockview fires a layout change for every panel title change.
  const sub = api.onDidLayoutChange(update)
  return () => {
    stop()
    sub.dispose()
  }
}
