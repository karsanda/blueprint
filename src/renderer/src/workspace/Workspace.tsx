import 'dockview-react/dist/styles/dockview.css'
import './dockview.css'
import {
  type DockviewApi,
  DockviewDefaultTab,
  DockviewReact,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
} from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import { ChangesPanel } from '../review/ChangesPanel'
import { useShallow } from 'zustand/react/shallow'
import { useReview } from '../review/store'
import { installReviewFollow } from '../review/install'
import { DifferencePanel } from '../review/DifferencePanel'
import { StatusLight } from '../status/StatusLight'
import { installNotifications } from '../status/notify'
import { installTitle } from '../status/title'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { addDefaultPanels } from './defaultLayout'
import { installLayoutSaving, restoreLayout } from './persist'
import { CloseDialog, requestClose } from './CloseDialog'
import { GroupActions } from './GroupActions'
import { isClaudeTab } from './sessions'

const blueprintTheme: DockviewTheme = { name: 'blueprint', className: 'dockview-theme-blueprint', gap: 6 }
const components = {
  terminal: TerminalPanel,
  changes: ChangesPanel,
  difference: DifferencePanel,
}

/** How many Claude tabs are open, kept current as tabs come and go. */
function useClaudeTabCount(api: DockviewApi): number {
  const count = () => api.panels.filter((p) => isClaudeTab(p.id)).length
  const [n, setN] = useState(count)
  useEffect(() => {
    const update = () => setN(count())
    update()
    const subs = [api.onDidAddPanel(update), api.onDidRemovePanel(update)]
    return () => subs.forEach((sub) => sub.dispose())
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- count only reads api
  }, [api])
  return n
}

/** The mark on a tab whose session changed files that another open session changed too. */
function OverlapMark({ tabId }: { tabId: string }) {
  const overlap = useReview((s) => s.overlaps.find((o) => o.tabId === tabId))
  const names = useReview(useShallow((s) => (overlap?.others ?? []).map((id) => s.names[id] ?? id))).join(
    ', ',
  )
  if (!overlap) return null
  return (
    <span
      role="img"
      aria-label={`Overlap with ${names}`}
      title={`Also changed by ${names}: ${overlap.paths.join(', ')}`}
      className="bp-overlap"
    >
      ⚠
    </span>
  )
}

/** The name field a double-click opens in place of a Claude tab's title. */
function NameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const done = useRef(false)
  const finish = (value: string | null) => {
    if (done.current) return
    done.current = true
    onDone(value)
  }
  return (
    <input
      className="bp-tab-name"
      aria-label="Session name"
      defaultValue={name}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field opens on a double-click
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) finish(e.currentTarget.value)
        else if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  )
}

/**
 * A Claude tab has a close action (button and middle-click) while another Claude tab is open;
 * no other tab has one, and the last Claude tab stays. Double-clicking a Claude tab's title renames it.
 */
function BlueprintTab(props: IDockviewPanelHeaderProps) {
  const claudeTabs = useClaudeTabCount(props.containerApi)
  const isClaude = isClaudeTab(props.api.id)
  const closable = isClaude && claudeTabs > 1
  const [editing, setEditing] = useState(false)
  const rename = (value: string | null) => {
    setEditing(false)
    const name = value?.trim()
    if (name) props.api.setTitle(name)
  }
  return (
    <div className="bp-tab" onDoubleClick={isClaude ? () => setEditing(true) : undefined}>
      <StatusLight tabId={props.api.id} />
      <OverlapMark tabId={props.api.id} />
      {editing ? (
        <NameField name={props.api.title ?? props.api.id} onDone={rename} />
      ) : (
        <DockviewDefaultTab
          {...props}
          hideClose={!closable}
          closeActionOverride={() => requestClose(props.containerApi, props.api.id)}
        />
      )}
    </div>
  )
}

export function Workspace() {
  return (
    <>
      <DockviewReact
        className="h-full"
        components={components}
        theme={blueprintTheme}
        rightHeaderActionsComponent={GroupActions}
        defaultTabComponent={BlueprintTab}
        onReady={(e) => {
          void (async () => {
            try {
              const saved = await window.blueprint.getLayout().catch(() => null)
              if (saved) restoreLayout(e.api, saved)
              addDefaultPanels(e.api)
            } catch {
              // A layout that breaks the restore must not leave the window without its installers.
              e.api.clear()
              addDefaultPanels(e.api)
            }
            installLayoutSaving(e.api)
            installTitle(e.api)
            installReviewFollow(e.api)
            installNotifications(e.api)
          })()
        }}
      />
      <CloseDialog />
    </>
  )
}
