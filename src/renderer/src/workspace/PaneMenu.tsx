import { Menu } from '@base-ui/react/menu'
import type { DockviewApi, DockviewGroupPanel, IDockviewHeaderActionsProps } from 'dockview-react'
import { Ellipsis } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'

type Side = 'left' | 'right' | 'top' | 'bottom'

/**
 * Where each floating pane came from, while Blueprint runs: the active tab of the pane beside it, and
 * the side it was on. dockview forgets this when a pane floats.
 */
const origins = new Map<string, { panelId: string; side: Side }>()

const LOOK: { direction: 'left' | 'right' | 'up' | 'down'; side: Side }[] = [
  { direction: 'left', side: 'right' },
  { direction: 'right', side: 'left' },
  { direction: 'up', side: 'bottom' },
  { direction: 'down', side: 'top' },
]

/** Lifts a docked pane above the layout, noting the pane beside it so Dock can put it back. */
export function floatPane(api: DockviewApi, group: DockviewGroupPanel): void {
  for (const { direction, side } of LOOK) {
    const neighbour = api.adjacentGroupInDirection(group, direction)?.activePanel
    if (neighbour) {
      origins.set(group.id, { panelId: neighbour.id, side })
      break
    }
  }
  api.addFloatingGroup(group)
}

/**
 * Docks a floating pane beside the pane it left, while that pane is still open in the grid; otherwise
 * as a new column at the right edge.
 */
export function dockPane(api: DockviewApi, group: DockviewGroupPanel): void {
  const origin = origins.get(group.id)
  origins.delete(group.id)
  const neighbour = origin && api.getPanel(origin.panelId)?.group
  const target =
    neighbour?.api.location.type === 'grid' ? api.groups.find((g) => g.id === neighbour.id) : undefined
  if (target && origin) group.api.moveTo({ group: target, position: origin.side })
  else group.api.moveTo({ position: 'right' })
}

/** Where a pane sits, kept current as it floats and docks; read on every render, so a header made anew is never stale. */
function useLocation(group: DockviewGroupPanel): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const sub = group.api.onDidLocationChange(onChange)
      return () => sub.dispose()
    },
    [group],
  )
  return useSyncExternalStore(subscribe, () => group.api.location.type)
}

const ITEM =
  'flex cursor-default items-center px-3 py-1.5 outline-none select-none data-[highlighted]:bg-bp-line-soft'

/** The pane's menu, before zoom: Float a docked pane, Dock a floating one. */
export function PaneMenu({ containerApi, group }: IDockviewHeaderActionsProps) {
  const location = useLocation(group)
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Pane menu"
        title="Pane menu"
        className="flex h-full items-center px-2 text-bp-muted hover:text-bp-ink"
      >
        <Ellipsis size={13} strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        {/* Above dockview's floating panes (z-index 997), which would otherwise catch the clicks. */}
        <Menu.Positioner align="end" sideOffset={2} className="z-[1000]">
          <Menu.Popup className="min-w-28 border border-bp-line bg-bp-sheet py-1 text-xs text-bp-ink shadow-lg outline-none">
            {location === 'grid' && (
              <Menu.Item className={ITEM} onClick={() => floatPane(containerApi, group)}>
                Float
              </Menu.Item>
            )}
            {location === 'floating' && (
              <Menu.Item className={ITEM} onClick={() => dockPane(containerApi, group)}>
                Dock
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
