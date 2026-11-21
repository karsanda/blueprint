import { describe, expect, it } from 'vitest'
import type { ReviewRange, ReviewState } from '../../../shared/api'
import { useReview } from './store'

const listed = (range: ReviewRange, path: string): ReviewState => ({
  kind: 'changes',
  range,
  changes: [
    { path, id: 'a'.repeat(40), kind: 'added', added: 1, removed: 0, binary: false, by: ['claude-1'] },
  ],
})

describe('useReview', () => {
  it('ignores a list for the range the Developer just left', () => {
    const review = useReview.getState()
    review.receive(listed('turn', 'turn.txt'))
    review.pick('turn.txt')
    review.setRange('session')
    review.receive(listed('turn', 'late.txt'))
    expect(useReview.getState()).toMatchObject({ state: listed('turn', 'turn.txt'), picked: 'turn.txt' })
    review.receive(listed('session', 'session.txt'))
    expect(useReview.getState()).toMatchObject({ state: listed('session', 'session.txt'), picked: null })
  })
})
