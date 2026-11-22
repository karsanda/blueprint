import { Dialog } from '@base-ui/react/dialog'
import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { useClaudeStatus } from '../status/store'
import { useTerminalStatus } from '../terminal/status'
import { closeTab, tabKind } from './sessions'

/** What the dialog asks about: a Claude session that works or waits, or a shell that runs a program. */
type Reason = { kind: 'working' } | { kind: 'waiting' } | { kind: 'program'; program: string }

interface Request {
  api: DockviewApi
  tabId: string
  name: string
  reason: Reason
  /** The body of the window that holds the tab, so a pop-out asks in its own window. */
  container: HTMLElement
}

const useRequest = create<{ request: Request | null }>(() => ({ request: null }))

function ask(api: DockviewApi, tabId: string, reason: Reason): void {
  const panel = api.getPanel(tabId)
  const name = panel?.title ?? tabId
  const container = panel?.group.element.ownerDocument.body ?? document.body
  useRequest.setState({ request: { api, tabId, name, reason, container } })
}

/**
 * Closes a Claude or shell tab. An Idle session closes at once; a Working or Needs-you one first asks,
 * in Blueprint's own dialog. A shell closes at once when it ended or sits at its prompt, and asks first
 * while a program runs in it.
 */
export function requestClose(api: DockviewApi, tabId: string): void {
  const kind = tabKind(tabId)
  if (kind === 'claude') {
    const status = useClaudeStatus.getState().tabs[tabId]
    if (status === 'working') ask(api, tabId, { kind: 'working' })
    else if (status === 'needs-you') ask(api, tabId, { kind: 'waiting' })
    else closeTab(api, tabId)
  } else if (kind === 'shell') {
    const state = useTerminalStatus.getState().tabs[tabId]?.state
    if (state === 'exited' || state === 'failed') {
      closeTab(api, tabId)
      return
    }
    void window.blueprint
      .foregroundProgram(tabId)
      .catch(() => null)
      .then((program) => {
        if (program) ask(api, tabId, { kind: 'program', program })
        else closeTab(api, tabId)
      })
  }
}

function description(reason: Reason): string {
  if (reason.kind === 'program') return `It is still running ${reason.program}.`
  return reason.kind === 'waiting' ? 'It is waiting for your answer.' : 'It is still working.'
}

const dismiss = () => useRequest.setState({ request: null })

/** The dialog behind `requestClose`. Mounted once, beside the dock. */
export function CloseDialog() {
  const request = useRequest((s) => s.request)
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && dismiss()}>
      <Dialog.Portal container={request?.container}>
        {/* Above dockview's floating panes (z-index 997). */}
        <Dialog.Backdrop className="fixed inset-0 z-[1000] bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[1000] w-80 -translate-x-1/2 -translate-y-1/2 border border-bp-line bg-bp-sheet p-4 text-bp-ink shadow-lg outline-none">
          <Dialog.Title className="text-sm font-semibold text-bp-head">
            {request ? `Close ${request.name}?` : ''}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-xs text-bp-muted">
            {request ? description(request.reason) : ''}
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={dismiss}>
              Keep it
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (request) closeTab(request.api, request.tabId)
                dismiss()
              }}
            >
              {request?.reason.kind === 'program' ? 'Close shell' : 'Close session'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
