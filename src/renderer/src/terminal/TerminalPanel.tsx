import type { IDockviewPanelProps } from 'dockview-react'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { TerminalKind } from '../../../shared/api'
import { STATUS_LABEL } from '../status/labels'
import { useClaudeStatus } from '../status/store'
import { getSession } from './session'
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
