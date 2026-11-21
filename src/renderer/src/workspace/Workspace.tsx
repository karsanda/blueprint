import 'dockview-react/dist/styles/dockview.css'
import './dockview.css'
import { DockviewReact, type DockviewTheme } from 'dockview-react'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { addDefaultPanels } from './defaultLayout'
import { ZoomAction } from './ZoomAction'

const blueprintTheme: DockviewTheme = { name: 'blueprint', className: 'dockview-theme-blueprint', gap: 14 }
const components = { terminal: TerminalPanel }

export function Workspace() {
  return (
    <DockviewReact
      className="h-full"
      components={components}
      theme={blueprintTheme}
      rightHeaderActionsComponent={ZoomAction}
      onReady={(e) => addDefaultPanels(e.api)}
    />
  )
}
