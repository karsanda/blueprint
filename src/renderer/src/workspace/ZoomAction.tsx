import type { IDockviewHeaderActionsProps } from 'dockview-react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Zooms a pane to fill the dock, and back to the layout it came from. */
export function ZoomAction({ api, containerApi }: IDockviewHeaderActionsProps) {
  const [zoomed, setZoomed] = useState(() => api.isMaximized())
  useEffect(() => {
    const sub = containerApi.onDidMaximizedGroupChange(() => setZoomed(api.isMaximized()))
    return () => sub.dispose()
  }, [api, containerApi])

  const Icon = zoomed ? Minimize2 : Maximize2
  return (
    <button
      type="button"
      aria-label={zoomed ? 'Zoom out' : 'Zoom pane'}
      title={zoomed ? 'Zoom out' : 'Zoom pane'}
      className="flex h-full items-center px-2 text-bp-muted hover:text-bp-ink"
      onClick={() => (zoomed ? containerApi.exitMaximizedGroup() : api.maximize())}
    >
      <Icon size={13} strokeWidth={1.75} />
    </button>
  )
}
