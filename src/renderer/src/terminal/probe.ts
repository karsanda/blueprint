import type { TerminalProbe } from '../../../shared/probe'
import { findSession } from './session'

const term = (tabId: string) => findSession(tabId)?.term

/** Frames each terminal drew, counted from the first time a test asked. */
const drawn = new WeakMap<object, { count: number }>()

/** Lets e2e tests read terminals, which WebGL draws on a canvas. Installed only when BLUEPRINT_E2E=1. */
export function installProbe(): void {
  if (!window.blueprint.e2e) return
  const probe: TerminalProbe = {
    text(tabId) {
      const buffer = term(tabId)?.buffer.active
      if (!buffer) return ''
      const lines: string[] = []
      for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
      return lines.join('\n')
    },
    size(tabId) {
      const t = term(tabId)
      return t ? { cols: t.cols, rows: t.rows } : null
    },
    renders(tabId) {
      const t = term(tabId)
      if (!t) return 0
      let counter = drawn.get(t)
      if (!counter) {
        const fresh = { count: 0 }
        t.onRender(() => fresh.count++)
        drawn.set(t, fresh)
        counter = fresh
      }
      return counter.count
    },
    focus: (tabId) => term(tabId)?.focus(),
    selectAll: (tabId) => term(tabId)?.selectAll(),
  }
  window.blueprintProbe = probe
}
