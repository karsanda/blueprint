import { create } from 'zustand'
import type { ClaudeStatus, StatusSignal } from '../../../shared/api'
import { nextStatus } from '../../../shared/status'

interface ClaudeStatusStore {
  tabs: Record<string, ClaudeStatus | undefined>
  /** Folds a signal into a session's status. A tab with no status (not running) ignores it. */
  apply(tabId: string, signal: StatusSignal): void
  set(tabId: string, status: ClaudeStatus | undefined): void
}

/** Each Claude session's status: Idle, Working or Needs you. */
export const useClaudeStatus = create<ClaudeStatusStore>((set) => ({
  tabs: {},
  apply: (tabId, signal) =>
    set((s) => {
      const current = s.tabs[tabId]
      if (current === undefined) return s
      const next = nextStatus(current, signal)
      return next === current ? s : { tabs: { ...s.tabs, [tabId]: next } }
    }),
  set: (tabId, status) => set((s) => ({ tabs: { ...s.tabs, [tabId]: status } })),
}))
