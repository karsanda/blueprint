import type { DockviewApi } from 'dockview-react'
import { windowTitle } from '../../../shared/status'
import { useClaudeStatus } from './store'

/**
 * Keeps every Blueprint window's title, pop-outs included, naming the sessions that need the Developer.
 * Returns the unsubscribe.
 */
export function installTitle(api: DockviewApi): () => void {
  const update = () => {
    const { tabs } = useClaudeStatus.getState()
    const waiting = api.panels.filter((p) => tabs[p.id] === 'needs-you').map((p) => p.title ?? p.id)
    const title = windowTitle(waiting)
    document.title = title
    for (const popout of api.getPopouts()) popout.window.document.title = title
  }
  update()
  const stop = useClaudeStatus.subscribe(update)
  // dockview fires a layout change for every panel title change.
  const subs = [api.onDidLayoutChange(update), api.onDidAddPopoutGroup(update)]
  return () => {
    stop()
    for (const sub of subs) sub.dispose()
  }
}
