import type { IDockviewPanelProps } from 'dockview-react'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { SavedConversation, TerminalKind } from '../../../shared/api'
import { STATUS_LABEL } from '../status/labels'
import { useClaudeStatus } from '../status/store'
import { findSession, getSession, type TerminalSession } from './session'
import { useTerminalStatus } from './status'
import { TerminalNotice } from './TerminalNotice'

export interface TerminalParams {
  kind: TerminalKind
  /** A Claude tab's conversation, for resuming it when the Folder reopens. */
  conversation?: SavedConversation
}

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalParams>) {
  const host = useRef<HTMLDivElement>(null)
  const status = useTerminalStatus((s) => s.tabs[api.id])
  const claude = useClaudeStatus((s) => s.tabs[api.id])
  // The first render creates the session with its conversation, before it attaches.
  const session = getSession(api.id, params.kind, params.conversation)
  const cols = useCols(session)
  useEffect(() => {
    if (host.current) session.attach(host.current)
    return () => session.detach()
    // The session is the one for this tab and kind, so those are what re-attach it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.id, params.kind])

  // A tab the Developer clicks puts the keyboard in its terminal once its pane is visible, which is
  // after dockview has laid out again; a hidden terminal cannot take focus.
  useEffect(() => {
    let waiting = false
    const focus = () => {
      waiting = false
      const term = findSession(api.id)?.term
      // The browser may still hold focus on the clicked tab for a frame or two, so keep asking until
      // the terminal has it.
      let frames = 0
      // The terminal's own window: a pop-out has its own document, focus and frames.
      const doc = term?.textarea?.ownerDocument ?? document
      const win = doc.defaultView ?? window
      const take = () => {
        // A rename field the Developer opened by double-clicking keeps the keyboard.
        if (doc.activeElement?.classList.contains('bp-tab-name')) return
        // A tab that stopped being active meanwhile (as tabs do while a preset rearranges the dock) must
        // not take the keyboard: focusing its terminal would make dockview activate it again.
        if (!api.isActive) return
        term?.focus()
        if (api.isActive && term?.textarea && doc.activeElement !== term.textarea && ++frames < 30) {
          win.requestAnimationFrame(take)
        }
      }
      // The first try waits a frame, so it runs after the click's own focus change onto the tab.
      win.requestAnimationFrame(take)
    }
    const subs = [
      api.onDidActiveChange((e) => {
        if (!e.isActive) waiting = false
        else if (api.isVisible) focus()
        else waiting = true
      }),
      api.onDidVisibilityChange((e) => {
        if (e.isVisible && waiting) focus()
      }),
    ]
    return () => subs.forEach((sub) => sub.dispose())
  }, [api])

  return (
    <div className="flex h-full w-full flex-col bg-bp-sheet p-1.5" data-tab={api.id} data-status={claude}>
      {params.kind === 'claude' && (
        <div className="flex items-center">
          <div className="bp-dim min-w-0 flex-1">{cols} COL</div>
          {claude && <span className="bp-status">{STATUS_LABEL[claude]}</span>}
        </div>
      )}
      <div ref={host} className="min-h-0 flex-1" />
      {status && (
        <TerminalNotice
          kind={params.kind}
          status={status}
          onRestart={() => void session.restart()}
          onDismiss={(which) => {
            const now = useTerminalStatus.getState().tabs[api.id]
            if (now) useTerminalStatus.getState().set(api.id, { ...now, [which]: undefined })
          }}
        />
      )}
    </div>
  )
}

/** The terminal's width in columns, kept current as the pane resizes. */
function useCols(session: TerminalSession): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const sub = session.term.onResize(onChange)
      return () => sub.dispose()
    },
    [session],
  )
  return useSyncExternalStore(subscribe, () => session.term.cols)
}
