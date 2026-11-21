import { create } from 'zustand'
import type { Overlap, ReviewRange, ReviewState } from '../../../shared/api'

interface ReviewStore {
  /** What the review last reported. */
  state: ReviewState
  range: ReviewRange
  /** The path of the Change the Developer picked, while it is still listed. */
  picked: string | null
  /** The Claude tab focused last: the session the Changes pane shows. */
  shownTab: string | null
  /** Open Claude tabs, the one focused last at the end. */
  focusOrder: string[]
  overlaps: Overlap[]
  /** Each Claude tab's current title, kept after the tab closes. */
  names: Record<string, string>
  setRange(range: ReviewRange): void
  focusTab(tabId: string): void
  /** A Claude tab closed. `open` lists the Claude tabs still open. */
  closeTab(tabId: string, open: string[]): void
  setNames(names: Record<string, string>): void
  setOverlaps(overlaps: Overlap[]): void
  pick(path: string): void
  receive(state: ReviewState): void
}

/** The Changes pane's state: the review from main, the range shown and the picked Change. */
export const useReview = create<ReviewStore>((set) => ({
  state: { kind: 'waiting', message: 'Changes show here once Claude starts.' },
  range: 'turn',
  picked: null,
  shownTab: 'claude-1',
  focusOrder: ['claude-1'],
  overlaps: [],
  names: { 'claude-1': 'Claude' },
  setRange: (range) => set({ range }),
  focusTab: (tabId) =>
    set((s) => ({ shownTab: tabId, focusOrder: [...s.focusOrder.filter((id) => id !== tabId), tabId] })),
  closeTab: (tabId, open) =>
    set((s) => {
      const focusOrder = s.focusOrder.filter((id) => id !== tabId && open.includes(id))
      return {
        focusOrder,
        shownTab: s.shownTab === tabId ? (focusOrder.at(-1) ?? open[0] ?? null) : s.shownTab,
      }
    }),
  setNames: (names) => set((s) => ({ names: { ...s.names, ...names } })),
  setOverlaps: (overlaps) => set({ overlaps }),
  pick: (path) => set({ picked: path }),
  receive: (state) =>
    set((s) =>
      // A list for the range the Developer just left can still arrive. The new range's list follows it.
      state.kind === 'changes' && state.range !== s.range
        ? s
        : {
            state,
            picked:
              s.picked !== null && state.kind === 'changes' && state.changes.some((c) => c.path === s.picked)
                ? s.picked
                : null,
          },
    ),
}))
