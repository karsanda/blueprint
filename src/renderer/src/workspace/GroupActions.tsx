import type { IDockviewHeaderActionsProps } from 'dockview-react'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isClaudeTab, openClaudeSession } from './sessions'
import { ZoomAction } from './ZoomAction'

/** Whether this group holds a Claude tab, kept current as tabs come and go. */
function useHoldsClaude({ group, containerApi }: IDockviewHeaderActionsProps): boolean {
  const [holds, setHolds] = useState(() => group.panels.some((p) => isClaudeTab(p.id)))
  useEffect(() => {
    const update = () => setHolds(group.panels.some((p) => isClaudeTab(p.id)))
    update()
    const subs = [
      containerApi.onDidAddPanel(update),
      containerApi.onDidRemovePanel(update),
      containerApi.onDidMovePanel(update),
    ]
    return () => subs.forEach((s) => s.dispose())
  }, [group, containerApi])
  return holds
}

/** The actions at the right of a group's tabs: a new Claude session where the group holds one, then zoom. */
export function GroupActions(props: IDockviewHeaderActionsProps) {
  const holdsClaude = useHoldsClaude(props)
  return (
    <div className="flex h-full items-center">
      {holdsClaude && (
        <button
          type="button"
          aria-label="New Claude session"
          title="New Claude session"
          className="flex h-full items-center px-2 text-bp-muted hover:text-bp-ink"
          onClick={() => openClaudeSession(props.containerApi, props.group)}
        >
          <Plus size={13} strokeWidth={1.75} />
        </button>
      )}
      <ZoomAction {...props} />
    </div>
  )
}
