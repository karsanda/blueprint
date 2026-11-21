import { useClaudeStatus } from './store'

/** Feeds the status signals main hears into each session's status. */
export function installStatus(): void {
  window.blueprint.onStatusSignal((tabId, signal) => useClaudeStatus.getState().apply(tabId, signal))
}
