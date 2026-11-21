import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef } from 'react'
import type { TerminalKind } from '../../../shared/api'
import { getSession } from './session'
import { useTerminalStatus } from './status'
import { TerminalNotice } from './TerminalNotice'

export interface TerminalParams {
  kind: TerminalKind
}

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalParams>) {
  const host = useRef<HTMLDivElement>(null)
  const status = useTerminalStatus((s) => s.tabs[api.id])
  useEffect(() => {
    const session = getSession(api.id, params.kind)
    if (host.current) session.attach(host.current)
    return () => session.detach()
  }, [api.id, params.kind])

  return (
    <div className="flex h-full w-full flex-col bg-bp-sheet p-1.5" data-tab={api.id}>
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
