import type { DockviewApi, GroupviewPanelState, SerializedDockview } from 'dockview-react'
import { Orientation } from 'dockview-react'
import { focusTab } from '../status/notify'
import { openTab, tabKind } from './sessions'

export type PresetId = 'agent-and-review' | 'two-agents' | 'terminal-heavy' | 'focus'

/** The presets in key order, with the label and key the Layout menu shows. */
export const PRESETS: readonly { id: PresetId; label: string; key: string }[] = [
  { id: 'agent-and-review', label: 'Agent and review', key: 'Ctrl+Shift+1' },
  { id: 'two-agents', label: 'Two agents', key: 'Ctrl+Shift+2' },
  { id: 'terminal-heavy', label: 'Terminal heavy', key: 'Ctrl+Shift+3' },
  { id: 'focus', label: 'Focus', key: 'Ctrl+Shift+4' },
]

/** An open tab, as a preset places it. */
export interface PresetTab {
  id: string
  component: string
  title: string
  params?: Record<string, unknown>
}

/** A pane's tabs, or panes side by side (along the branch's orientation). */
type Shape = string[] | Shape[]

const CHANGES_WIDTH = 250

type GridNode = SerializedDockview['grid']['root']

/** Where a tab sorts within a pane: Claude tabs, shells, Changes, Difference, then anything else; by number within a kind. */
function rank(id: string): [number, number] {
  const kind = tabKind(id)
  const n = Number(/-(\d+)$/.exec(id)?.[1] ?? 0)
  if (kind === 'claude') return [0, n]
  if (kind === 'shell') return [1, n]
  if (id === 'changes') return [2, 0]
  if (id === 'difference') return [3, 0]
  return [4, 0]
}

function byRank(a: string, b: string): number {
  const [ka, na] = rank(a)
  const [kb, nb] = rank(b)
  return ka - kb || na - nb
}

/** The panes of a preset, before sizes: nested arrays alternate orientation, starting HORIZONTAL at the root. */
function shapeOf(preset: PresetId, ids: string[]): Shape[] {
  const sorted = ids.toSorted(byRank)
  const claude = sorted.filter((id) => tabKind(id) === 'claude')
  const shells = sorted.filter((id) => tabKind(id) === 'shell')
  const review = sorted.filter((id) => id === 'changes' || id === 'difference')
  const other = sorted.filter((id) => !tabKind(id) && id !== 'changes' && id !== 'difference')
  const changes = review.filter((id) => id === 'changes')
  const difference = review.filter((id) => id === 'difference')
  switch (preset) {
    case 'agent-and-review':
      return [
        [...changes, ...other],
        [[claude, difference], shells],
      ]
    case 'two-agents':
      return [
        [...review, ...other],
        [[claude.slice(0, 1), claude.slice(1)], shells],
      ]
    case 'terminal-heavy':
      return [
        [...claude, ...review, ...other],
        [shells.slice(0, 1), shells.slice(1)],
      ]
    case 'focus':
      break
  }
  return [sorted]
}

const isLeaf = (shape: Shape): shape is string[] => shape.length === 0 || typeof shape[0] === 'string'

/** Drops empty panes, and branches left with nothing in them. */
function prune(shapes: Shape[]): Shape[] {
  return shapes.map((s) => (isLeaf(s) ? s : prune(s))).filter((s) => s.length > 0)
}

/**
 * The dockview layout of a preset for these tabs. Tabs sort by kind, then number; terminals render
 * always; Changes is 250 wide where it has a pane of its own, and other splits are even. The keyboard
 * tab stays active in its pane, and its pane is the active group; in Focus the active tab is the Claude
 * tab with the keyboard, or else the lowest-numbered Claude tab.
 */
export function presetLayout(
  preset: PresetId,
  tabs: PresetTab[],
  size: { width: number; height: number },
  keyboardTab?: string,
): SerializedDockview {
  const ids = tabs.map((t) => t.id)
  const root = prune(shapeOf(preset, ids))
  const active = keyboardAfter(preset, ids, keyboardTab)

  let nextGroup = 0
  let activeGroup: string | undefined
  const build = (
    shape: Shape,
    extent: { along: number; across: number },
    orientation: Orientation,
  ): GridNode => {
    if (isLeaf(shape)) {
      const id = String(++nextGroup)
      const activeView = active && shape.includes(active) ? active : shape[0]
      if (active && shape.includes(active)) activeGroup = id
      return { type: 'leaf', data: { views: shape, activeView, id }, size: extent.along }
    }
    const children = shape
    // The Changes pane keeps its width; the others share what is left.
    const fixed: number[] = children.map((c) =>
      orientation === Orientation.HORIZONTAL && isLeaf(c) && c[0] === 'changes' ? CHANGES_WIDTH : 0,
    )
    const flexible = children.length - fixed.filter(Boolean).length
    const rest = (extent.across - fixed.reduce((a, b) => a + b, 0)) / Math.max(flexible, 1)
    const childOrientation =
      orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL
    return {
      type: 'branch',
      size: extent.along,
      data: children.map((c, i) =>
        build(c, { along: fixed[i] || rest, across: extent.along }, childOrientation),
      ),
    }
  }
  const grid = build(root, { along: size.height, across: size.width }, Orientation.HORIZONTAL)

  const panels = Object.fromEntries(
    tabs.map((t): [string, GroupviewPanelState] => [
      t.id,
      {
        id: t.id,
        contentComponent: t.component,
        title: t.title,
        ...(t.params ? { params: t.params } : {}),
        ...(tabKind(t.id) ? { renderer: 'always' as const } : {}),
      },
    ]),
  )
  return {
    grid: { root: grid, width: size.width, height: size.height, orientation: Orientation.HORIZONTAL },
    panels,
    ...(activeGroup ? { activeGroup } : {}),
  }
}

/**
 * The tab that has the keyboard after a preset: the tab that had it, wherever it lands; in Focus, the
 * Claude tab that had it, or else the lowest-numbered Claude tab.
 */
function keyboardAfter(preset: PresetId, ids: string[], keyboardTab: string | undefined): string | undefined {
  if (preset !== 'focus') return keyboardTab && ids.includes(keyboardTab) ? keyboardTab : undefined
  if (keyboardTab && tabKind(keyboardTab) === 'claude' && ids.includes(keyboardTab)) return keyboardTab
  return ids.filter((id) => tabKind(id) === 'claude').toSorted(byRank)[0]
}

/**
 * Rearranges the dock to a preset. Two agents and Terminal heavy first open the second Claude session or
 * shell they need. The open panels move into place (nothing closes or restarts), floating panes dock, and
 * pop-out windows close. The tab that had the keyboard keeps it, except in Focus, where Claude takes it.
 */
export function applyPreset(api: DockviewApi, preset: PresetId): void {
  const keyboardTab = api.activePanel?.id
  const count = (kind: 'claude' | 'shell') => api.panels.filter((p) => tabKind(p.id) === kind).length
  const firstGroupWith = (kind: 'claude' | 'shell') => api.panels.find((p) => tabKind(p.id) === kind)?.group
  if (preset === 'two-agents' && count('claude') < 2) {
    const group = firstGroupWith('claude')
    if (group) openTab(api, group, 'claude', { background: true })
  }
  if (preset === 'terminal-heavy' && count('shell') < 2) {
    const group = firstGroupWith('shell')
    if (group) openTab(api, group, 'shell', { background: true })
  }
  const tabs: PresetTab[] = api.panels.map((p) => ({
    id: p.id,
    component: p.api.component,
    title: p.title ?? p.id,
    ...(p.params ? { params: p.params } : {}),
  }))
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  const json = presetLayout(preset, tabs, { width: api.width, height: api.height }, keyboardTab)
  api.fromJSON(json, { reuseExistingPanels: true })
  const keyboard = keyboardAfter(
    preset,
    tabs.map((t) => t.id),
    keyboardTab,
  )
  if (keyboard) focusTab(api, keyboard)
}
