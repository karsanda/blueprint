import { useReview } from './store'

/** Feeds the review main pushes into the store. */
export function installReview(): void {
  window.blueprint.onReviewUpdate((state) => useReview.getState().receive(state))
}
