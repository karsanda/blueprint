import { Dialog } from '@base-ui/react/dialog'
import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { useClaudeStatus } from '../status/store'
import { closeClaudeSession, isClaudeTab } from './sessions'

interface Request {
  api: DockviewApi
  tabId: string
  name: string
  waiting: boolean
}

const useRequest = create<{ request: Request | null }>(() => ({ request: null }))

/**
 * Closes a Claude tab. An Idle session closes at once; a Working or Needs-you one first asks,
 * in Blueprint's own dialog.
 */
export function requestClose(api: DockviewApi, tabId: string): void {
  if (!isClaudeTab(tabId)) return
  const status = useClaudeStatus.getState().tabs[tabId]
  if (status !== 'working' && status !== 'needs-you') {
    closeClaudeSession(api, tabId)
    return
  }
  const name = api.getPanel(tabId)?.title ?? tabId
  useRequest.setState({ request: { api, tabId, name, waiting: status === 'needs-you' } })
}

const dismiss = () => useRequest.setState({ request: null })

/** The dialog behind `requestClose`. Mounted once, beside the dock. */
export function CloseDialog() {
  const request = useRequest((s) => s.request)
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && dismiss()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 border border-bp-line bg-bp-sheet p-4 text-bp-ink shadow-lg outline-none">
          <Dialog.Title className="text-sm font-semibold text-bp-head">
            {request ? `Close ${request.name}?` : ''}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-xs text-bp-muted">
            {request?.waiting ? 'It is waiting for your answer.' : 'It is still working.'}
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={dismiss}>
              Keep it
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (request) closeClaudeSession(request.api, request.tabId)
                dismiss()
              }}
            >
              Close session
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
