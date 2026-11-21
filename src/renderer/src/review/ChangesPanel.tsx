import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useState } from 'react'
import type { Change, ReviewRange } from '../../../shared/api'
import { useReview } from './store'

const RANGES: { range: ReviewRange; label: string }[] = [
  { range: 'turn', label: 'This turn' },
  { range: 'session', label: 'This session' },
]
const LETTER = { added: 'A', modified: 'M', deleted: 'D' } as const

export function ChangesPanel({ api, containerApi }: IDockviewPanelProps) {
  const state = useReview((s) => s.state)
  const range = useReview((s) => s.range)
  const visible = useVisible(api)
  useEffect(() => {
    window.blueprint.setReviewView({ range, visible, tabId: null })
  }, [range, visible])
  // A pane that goes away is no longer visible, whatever it last reported.
  useEffect(
    () => () =>
      window.blueprint.setReviewView({ range: useReview.getState().range, visible: false, tabId: null }),
    [],
  )

  return (
    <div className="bp-changes" data-tab="changes">
      <div className="bp-changes-head">
        {RANGES.map((r) => (
          <button
            key={r.range}
            type="button"
            aria-pressed={range === r.range}
            onClick={() => useReview.getState().setRange(r.range)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {state.kind !== 'changes' ? (
        <p className="bp-changes-note">{state.message}</p>
      ) : state.changes.length === 0 ? (
        <p className="bp-changes-note">No changes yet.</p>
      ) : (
        <ul className="bp-changes-list">
          {state.changes.map((c) => (
            <ChangeRow
              key={c.path}
              change={c}
              onPick={() => {
                useReview.getState().pick(c.path)
                containerApi.getPanel('difference')?.api.setActive()
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ChangeRow({ change: c, onPick }: { change: Change; onPick: () => void }) {
  const picked = useReview((s) => s.picked === c.path)
  return (
    <li
      data-path={c.path}
      data-by={c.by.length > 0 ? 'claude' : 'outside'}
      data-picked={picked}
      onClick={onPick}
    >
      <span
        role="img"
        aria-label={c.by.length > 0 ? 'Claude' : 'Changed outside Claude'}
        className={c.by.length > 0 ? 'bp-mark-claude' : 'bp-mark-outside'}
      >
        {c.by.length > 0 ? '●' : '○'}
      </span>
      <span className="bp-change-kind" data-kind={c.kind}>
        {LETTER[c.kind]}
      </span>
      <span className="bp-change-path">{c.path}</span>
      <span className="bp-change-count">{c.binary ? 'binary' : `+${c.added} −${c.removed}`}</span>
    </li>
  )
}

/** True while the pane is shown and the window is in view. */
function useVisible(api: IDockviewPanelProps['api']): boolean {
  const [visible, setVisible] = useState(() => api.isVisible && document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(api.isVisible && document.visibilityState === 'visible')
    update()
    const sub = api.onDidVisibilityChange(update)
    document.addEventListener('visibilitychange', update)
    return () => {
      sub.dispose()
      document.removeEventListener('visibilitychange', update)
    }
  }, [api])
  return visible
}
