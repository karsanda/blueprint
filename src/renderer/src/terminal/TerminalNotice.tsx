import { Button } from '@/components/ui/button'
import type { TerminalKind } from '../../../shared/api'
import type { TerminalStatus } from './status'

/** What ended, in the Developer's words: an exit code, or the signal that stopped it. */
function ending(status: TerminalStatus): string {
  const exit = status.exit
  if (!exit) return ''
  return exit.signal ? `signal ${exit.signal}` : `code ${exit.exitCode}`
}

const NOTICE_TEXT: Record<NonNullable<TerminalStatus['notice']>, string> = {
  'conversation-lost': 'The last conversation could not be found, so a new one started.',
  'held-elsewhere': 'This Folder is open in another Blueprint window, so a new conversation started.',
}

/** A bar under a terminal whose program ended or could not start, with a way to start it again. */
export function TerminalNotice({
  kind,
  status,
  onRestart,
  onDismiss,
}: {
  kind: TerminalKind
  status: TerminalStatus
  onRestart: () => void
  /** Hides one of a running terminal's muted lines. */
  onDismiss: (which: 'notice' | 'hooksBlocked') => void
}) {
  if (status.state === 'running') {
    const lines: { which: 'notice' | 'hooksBlocked'; text: string }[] = []
    if (status.notice) lines.push({ which: 'notice', text: NOTICE_TEXT[status.notice] })
    if (status.hooksBlocked) {
      lines.push({
        which: 'hooksBlocked',
        text: `${status.hooksBlocked} Blueprint cannot see this session's status or tell which Changes are Claude's.`,
      })
    }
    return lines.map(({ which, text }) => (
      <div
        key={which}
        role="status"
        className="mt-1.5 flex items-center gap-3 border-t border-bp-line-soft px-1 pt-2 pb-0.5"
      >
        <p className="min-w-0 flex-1 text-bp-muted">{text}</p>
        <Button size="sm" onClick={() => onDismiss(which)}>
          Dismiss
        </Button>
      </div>
    ))
  }
  if (status.state !== 'exited' && status.state !== 'failed') return null
  const failure = status.failure
  const program = kind === 'claude' ? 'Claude Code' : 'Shell'
  const action = kind === 'shell' && status.state === 'exited' ? 'New shell' : 'Restart'

  return (
    <div
      role="status"
      className={`mt-1.5 flex items-center gap-3 border-t px-1 pt-2 pb-0.5 ${failure ? 'border-bp-wait' : 'border-bp-line-soft'}`}
    >
      <div className="min-w-0 flex-1">
        {failure ? (
          <>
            <p className="text-bp-wait">{failure.message}</p>
            {failure.reason === 'not-installed' && (
              <p className="font-mono text-[12px] text-bp-muted">{failure.fix}</p>
            )}
          </>
        ) : (
          <p className="text-bp-muted">
            {program} exited ({ending(status)}).
          </p>
        )}
      </div>
      <Button size="sm" onClick={onRestart}>
        {action}
      </Button>
    </div>
  )
}
