import type { IDockviewPanelProps } from 'dockview-react'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { TerminalKind } from '../../../shared/api'
import { STATUS_LABEL } from '../status/labels'
import { useClaudeStatus } from '../status/store'
import { findSession, getSession } from './session'
import { useTerminalStatus } from './status'
import { TerminalNotice } from './TerminalNotice'

export interface TerminalParams {
  kind: TerminalKind
}

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalParams>) {
  const host = useRef<HTMLDivElement>(null)
  const status = useTerminalStatus((s) => s.tabs[api.id])
  const claude = useClaudeStatus((s) => s.tabs[api.id])
  const cols = useCols(api.id, params.kind)
  useEffect(() => {
    const session = getSession(api.id, params.kind)
    if (host.current) session.attach(host.current)
    return () => session.detach()
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
      const take = () => {
        term?.focus()
        if (api.isActive && term?.textarea && document.activeElement !== term.textarea && ++frames < 30) {
          requestAnimationFrame(take)
        }
      }
      take()
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
          onRestart={() => void getSession(api.id, params.kind).restart()}
        />
      )}
    </div>
  )
}

/** The terminal's width in columns, kept current as the pane resizes. */
function useCols(tabId: string, kind: TerminalKind): number {
  const session = getSession(tabId, kind)
  const subscribe = useCallback(
    (onChange: () => void) => {
      const sub = session.term.onResize(onChange)
      return () => sub.dispose()
    },
    [session],
  )
  return useSyncExternalStore(subscribe, () => session.term.cols)
}
