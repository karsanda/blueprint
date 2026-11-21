import { STATUS_LABEL } from './labels'
import { useClaudeStatus } from './store'

/** The small square on a Claude tab that shows its status. Shell tabs have none. */
export function StatusLight({ tabId }: { tabId: string }) {
  const status = useClaudeStatus((s) => s.tabs[tabId])
  if (status === undefined) return null
  return <span role="img" aria-label={STATUS_LABEL[status]} data-status={status} className="bp-light" />
}
