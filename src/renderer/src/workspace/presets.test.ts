import type { SerializedDockview } from 'dockview-react'
import { describe, expect, it, vi } from 'vitest'
// presets.ts reaches the terminal view, which needs a browser; presetLayout does not.
vi.mock('../status/notify', () => ({ focusTab: () => undefined }))
vi.mock('../terminal/session', () => ({ findSession: () => undefined }))

import { PRESETS, type PresetTab, presetLayout } from './presets'

type Node = SerializedDockview['grid']['root']
type Leaf = Exclude<Node['data'], Node[]>

const SIZE = { width: 1250, height: 800 }

function tab(id: string, title?: string, params?: Record<string, unknown>): PresetTab {
  const kind = id.startsWith('claude') ? 'claude' : id.startsWith('shell') ? 'shell' : undefined
  return {
    id,
    component: kind ? 'terminal' : id,
    title: title ?? id,
    ...(kind ? { params: params ?? { kind } } : {}),
  }
}

const tabs = (...ids: string[]): PresetTab[] => ids.map((id) => tab(id))

/** The grid as text: a leaf is its tabs joined by `+`, a branch is `H[…]` or `V[…]`. */
function shape(json: SerializedDockview): string {
  const walk = (node: Node, orientation: string): string =>
    Array.isArray(node.data)
      ? `${orientation[0]}[${node.data.map((c) => walk(c, orientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL')).join(', ')}]`
      : node.data.views.join('+')
  return walk(json.grid.root, json.grid.orientation)
}

function leaves(json: SerializedDockview): (Leaf & { size?: number })[] {
  const out: (Leaf & { size?: number })[] = []
  const walk = (node: Node): void => {
    if (Array.isArray(node.data)) node.data.forEach(walk)
    else out.push({ ...node.data, size: node.size })
  }
  walk(json.grid.root)
  return out
}

const leafWith = (json: SerializedDockview, id: string) => leaves(json).find((l) => l.views.includes(id))

describe('presetLayout', () => {
  it('Agent and review is the default layout', () => {
    const json = presetLayout('agent-and-review', tabs('claude-1', 'shell-1', 'changes', 'difference'), SIZE)
    expect(shape(json)).toBe('H[changes, V[H[claude-1, difference], shell-1]]')
    expect(leafWith(json, 'changes')?.size).toBe(250)
  })

  it('extra Claude tabs and shells stack in their panes, in number order', () => {
    const json = presetLayout(
      'agent-and-review',
      tabs('claude-3', 'claude-1', 'shell-2', 'shell-1', 'changes', 'difference'),
      SIZE,
    )
    expect(shape(json)).toBe('H[changes, V[H[claude-1+claude-3, difference], shell-1+shell-2]]')
  })

  it('Two agents puts the lowest two Claude tabs side by side', () => {
    const json = presetLayout(
      'two-agents',
      tabs('claude-4', 'claude-2', 'claude-1', 'shell-1', 'changes', 'difference'),
      SIZE,
    )
    expect(shape(json)).toBe('H[changes+difference, V[H[claude-1, claude-2+claude-4], shell-1]]')
  })

  it('Terminal heavy puts Claude with the review on the left, and two shells stacked on the right', () => {
    const json = presetLayout(
      'terminal-heavy',
      tabs('claude-1', 'shell-3', 'shell-1', 'shell-2', 'changes', 'difference'),
      SIZE,
    )
    expect(shape(json)).toBe('H[claude-1+changes+difference, V[shell-1, shell-2+shell-3]]')
  })

  it('Focus puts every tab in one pane with Claude active', () => {
    const all = tabs('shell-1', 'difference', 'claude-2', 'changes', 'claude-1')
    const withClaude2 = presetLayout('focus', all, SIZE, 'claude-2')
    expect(shape(withClaude2)).toBe('H[claude-1+claude-2+shell-1+changes+difference]')
    expect(leaves(withClaude2)[0]?.activeView).toBe('claude-2')
    expect(leaves(presetLayout('focus', all, SIZE, 'shell-1'))[0]?.activeView).toBe('claude-1')
  })

  it('the tab with the keyboard stays active where it lands', () => {
    const json = presetLayout(
      'agent-and-review',
      tabs('claude-1', 'shell-1', 'shell-2', 'changes', 'difference'),
      SIZE,
      'shell-2',
    )
    const shellLeaf = leafWith(json, 'shell-2')
    expect(shellLeaf?.activeView).toBe('shell-2')
    expect(json.activeGroup).toBe(shellLeaf?.id)
    expect(leafWith(json, 'claude-1')?.activeView).toBe('claude-1')
  })

  it('a tab keeps its title and parameters', () => {
    const conversation = { sessionId: 's', transcript: '/t/s.jsonl' }
    const json = presetLayout(
      'agent-and-review',
      [
        tab('claude-1'),
        tab('claude-2', 'docs', { kind: 'claude', conversation }),
        ...tabs('shell-1', 'changes', 'difference'),
      ],
      SIZE,
    )
    expect(json.panels['claude-2']).toMatchObject({
      id: 'claude-2',
      contentComponent: 'terminal',
      title: 'docs',
      params: { kind: 'claude', conversation },
      renderer: 'always',
    })
    expect(json.panels['changes']).toMatchObject({
      id: 'changes',
      contentComponent: 'changes',
      title: 'changes',
    })
  })

  it('lists the presets with their keys, in key order', () => {
    expect(PRESETS.map((p) => [p.label, p.key])).toEqual([
      ['Agent and review', 'Ctrl+Shift+1'],
      ['Two agents', 'Ctrl+Shift+2'],
      ['Terminal heavy', 'Ctrl+Shift+3'],
      ['Focus', 'Ctrl+Shift+4'],
    ])
  })
})
