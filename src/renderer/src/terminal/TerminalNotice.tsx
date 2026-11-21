import { Button } from '@/components/ui/button'
import type { TerminalKind } from '../../../shared/api'
import type { TerminalStatus } from './status'

/** What ended, in the Developer's words: an exit code, or the signal that stopped it. */
function ending(status: TerminalStatus): string {
  const exit = status.exit
  if (!exit) return ''
  return exit.signal ? `signal ${exit.signal}` : `code ${exit.exitCode}`
}

/** A bar under a terminal whose program ended or could not start, with a way to start it again. */
export function TerminalNotice({
  kind,
  status,
  onRestart,
}: {
  kind: TerminalKind
  status: TerminalStatus
  onRestart: () => void
}) {
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
