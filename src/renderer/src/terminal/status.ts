import { create } from 'zustand'
import type { ExitInfo, StartFailure } from '../../../shared/api'

export interface TerminalStatus {
  state: 'starting' | 'running' | 'exited' | 'failed'
  exit?: ExitInfo
  failure?: StartFailure
}

interface StatusStore {
  tabs: Record<string, TerminalStatus>
  set(tabId: string, status: TerminalStatus): void
}

/** Each tab's terminal state, for the notices and, later, the status lights. */
export const useTerminalStatus = create<StatusStore>((set) => ({
  tabs: {},
  set: (tabId, status) => set((s) => ({ tabs: { ...s.tabs, [tabId]: status } })),
}))
