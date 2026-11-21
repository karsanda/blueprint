import 'dockview-react/dist/styles/dockview.css'
import './dockview.css'
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
} from 'dockview-react'
import { StatusLight } from '../status/StatusLight'
import { installTitle } from '../status/title'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { addDefaultPanels } from './defaultLayout'
import { ZoomAction } from './ZoomAction'

const blueprintTheme: DockviewTheme = { name: 'blueprint', className: 'dockview-theme-blueprint', gap: 6 }
const components = { terminal: TerminalPanel }

/**
 * Tabs without a close action (button or middle-click). Closing a tab would leave its program
 * running with no way back; closing comes with the slices that can open new tabs.
 */
function BlueprintTab(props: IDockviewPanelHeaderProps) {
  return (
    <div className="bp-tab">
      <StatusLight tabId={props.api.id} />
      <DockviewDefaultTab {...props} hideClose />
    </div>
  )
}

export function Workspace() {
  return (
    <DockviewReact
      className="h-full"
      components={components}
      theme={blueprintTheme}
      rightHeaderActionsComponent={ZoomAction}
      defaultTabComponent={BlueprintTab}
      onReady={(e) => {
        addDefaultPanels(e.api)
        installTitle(e.api)
      }}
    />
  )
}
