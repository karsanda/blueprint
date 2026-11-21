import type { ClaudeStatus, StatusSignal } from './api'

/** Folds one signal into a Claude session's status. */
export function nextStatus(current: ClaudeStatus, signal: StatusSignal): ClaudeStatus {
  if (signal.kind === 'prompt') return 'working'
  if (signal.kind === 'asks') return 'needs-you'
  if (signal.kind === 'stop' || signal.kind === 'interrupted') return 'idle'
  if (signal.kind === 'tool-done') return current === 'needs-you' ? 'needs-you' : 'working'
  return current === 'needs-you' ? 'working' : current
}

/** The window title, naming the sessions that wait for the Developer. */
export function windowTitle(waiting: string[]): string {
  if (waiting.length === 0) return 'Blueprint'
  return `Needs you: ${waiting.join(', ')} — Blueprint`
}
