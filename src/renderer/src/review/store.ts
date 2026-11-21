import { create } from 'zustand'
import type { ReviewRange, ReviewState } from '../../../shared/api'

interface ReviewStore {
  /** What the review last reported. */
  state: ReviewState
  range: ReviewRange
  /** The path of the Change the Developer picked, while it is still listed. */
  picked: string | null
  setRange(range: ReviewRange): void
  pick(path: string): void
  receive(state: ReviewState): void
}

/** The Changes pane's state: the review from main, the range shown and the picked Change. */
export const useReview = create<ReviewStore>((set) => ({
  state: { kind: 'waiting', message: 'Changes show here once Claude starts.' },
  range: 'turn',
  picked: null,
  setRange: (range) => set({ range }),
  pick: (path) => set({ picked: path }),
  receive: (state) =>
    set((s) => ({
      state,
      picked:
        s.picked !== null && state.kind === 'changes' && state.changes.some((c) => c.path === s.picked)
          ? s.picked
          : null,
    })),
}))
