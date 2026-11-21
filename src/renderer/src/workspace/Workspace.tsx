import 'dockview-react/dist/styles/dockview.css'
import './dockview.css'
import {
  type DockviewApi,
  DockviewDefaultTab,
  DockviewReact,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
} from 'dockview-react'
import { useEffect, useState } from 'react'
import { ChangesPanel } from '../review/ChangesPanel'
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

/**
 * A Claude tab has a close action (button and middle-click) while another Claude tab is open;
 * no other tab has one, and the last Claude tab stays.
 */
function BlueprintTab(props: IDockviewPanelHeaderProps) {
  const claudeTabs = useClaudeTabCount(props.containerApi)
  const closable = isClaudeTab(props.api.id) && claudeTabs > 1
  return (
    <div className="bp-tab">
      <StatusLight tabId={props.api.id} />
      <DockviewDefaultTab
        {...props}
        hideClose={!closable}
        closeActionOverride={() => requestClose(props.containerApi, props.api.id)}
      />
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
            installNotifications(e.api)
          })()
        }}
      />
      <CloseDialog />
    </>
  )
}
