import { useEffect, useState } from 'react'
import type { FolderState } from '../../shared/api'
import { OpenFolder } from './OpenFolder'
import { LayoutMenu } from './workspace/LayoutMenu'
import { Workspace } from './workspace/Workspace'

export function App() {
  const [state, setState] = useState<FolderState | null>(null)
  useEffect(() => {
    void window.blueprint.getFolder().then(setState)
  }, [])
  const pick = (): void => {
    void window.blueprint.pickFolder().then(setState)
  }

  return (
    <div className="bp-grid flex h-full flex-col">
      <header className="mx-3.5 flex items-baseline gap-4 border-b border-bp-line-faint px-0.5 py-2 text-bp-chrome">
        <span className="text-[13px] font-semibold tracking-[0.2em]">BLUEPRINT</span>
        {state?.folder && <span className="font-mono text-[11.5px] text-bp-muted">{state.folder}</span>}
        {state?.folder && <LayoutMenu />}
      </header>
      <main className="min-h-0 flex-1">
        {state?.folder && <Workspace />}
        {state && !state.folder && <OpenFolder problem={state.problem} onPick={pick} />}
      </main>
    </div>
  )
}
