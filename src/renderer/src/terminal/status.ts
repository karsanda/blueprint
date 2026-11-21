import { create } from 'zustand'
import type { ExitInfo, StartFailure } from '../../../shared/api'

export interface TerminalStatus {
  state: 'starting' | 'running' | 'exited' | 'failed'
  exit?: ExitInfo
  failure?: StartFailure
  /** A muted line beside a running terminal. */
  notice?: 'conversation-lost'
}

interface StatusStore {
  tabs: Record<string, TerminalStatus>
  set(tabId: string, status: TerminalStatus): void
  /** Forgets a closed tab. */
  clear(tabId: string): void
}

/** Each tab's terminal state, for the notices and, later, the status lights. */
export const useTerminalStatus = create<StatusStore>((set) => ({
  tabs: {},
  set: (tabId, status) => set((s) => ({ tabs: { ...s.tabs, [tabId]: status } })),
  clear: (tabId) =>
    set((s) => {
      const { [tabId]: _gone, ...tabs } = s.tabs
      return { tabs }
    }),
}))
