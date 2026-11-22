import type { IDockviewHeaderActionsProps } from 'dockview-react'
import { Plus, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TerminalKind } from '../../../shared/api'
import { openTab, tabKind } from './sessions'
import { PaneMenu } from './PaneMenu'
import { ZoomAction } from './ZoomAction'

/** Whether this group holds a terminal tab of `kind`, kept current as tabs come and go. */
function useHolds({ group, containerApi }: IDockviewHeaderActionsProps, kind: TerminalKind): boolean {
  const holds = () => group.panels.some((p) => tabKind(p.id) === kind)
  const [held, setHeld] = useState(holds)
  useEffect(() => {
    const update = () => setHeld(holds())
    update()
    const subs = [
      containerApi.onDidAddPanel(update),
      containerApi.onDidRemovePanel(update),
      containerApi.onDidMovePanel(update),
    ]
    return () => subs.forEach((s) => s.dispose())
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- holds only reads group and kind
  }, [group, containerApi, kind])
  return held
}

function NewTabAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-full items-center px-2 text-bp-muted hover:text-bp-ink"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * The actions at the right of a group's tabs: a new shell where the group holds a shell, a new Claude
 * session where it holds one, the pane menu, then zoom.
 */
export function GroupActions(props: IDockviewHeaderActionsProps) {
  const holdsShell = useHolds(props, 'shell')
  const holdsClaude = useHolds(props, 'claude')
  return (
    <div className="flex h-full items-center">
      {holdsShell && (
        <NewTabAction label="New shell" onClick={() => openTab(props.containerApi, props.group, 'shell')}>
          <SquareTerminal size={13} strokeWidth={1.75} />
        </NewTabAction>
      )}
      {holdsClaude && (
        <NewTabAction
          label="New Claude session"
          onClick={() => openTab(props.containerApi, props.group, 'claude')}
        >
          <Plus size={13} strokeWidth={1.75} />
        </NewTabAction>
      )}
      <PaneMenu {...props} />
      <ZoomAction {...props} />
    </div>
  )
}
