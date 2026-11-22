import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Overlap } from '../../shared/api'

/** Claude Code sends these as prompts when a background command ends or a subagent hands back. They do not start a turn. */
export function isClaudeCodesOwnPrompt(prompt: string): boolean {
  return prompt.startsWith('<task-notification>') || prompt.startsWith('<agent-message')
}

/** The path of `file` relative to `folder`, with `/`. Null for the Folder itself or anything outside it. */
export function pathInFolder(folder: string, file: string): string | null {
  const rel = relative(resolve(folder), resolve(folder, file))
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

/** Every path a Claude session touched in the Folder, each with the next sequence number. */
export class TouchLog {
  private seq = 0
  /** Every touch of each path, in order. */
  private readonly byPath = new Map<string, { tabId: string; seq: number }[]>()
  /** The latest sequence number at which each tab touched each path. */
  private readonly lastByTab = new Map<string, Map<string, number>>()

  touch(path: string, tabId: string): void {
    const seq = ++this.seq
    const list = this.byPath.get(path)
    if (list) list.push({ tabId, seq })
    else this.byPath.set(path, [{ tabId, seq }])
    let last = this.lastByTab.get(tabId)
    if (!last) this.lastByTab.set(tabId, (last = new Map()))
    last.set(path, seq)
  }

  /** Touches every path for the tab, one after another. */
  touchAll(paths: string[], tabId: string): void {
    for (const path of paths) this.touch(path, tabId)
  }

  /** The current sequence number. A range starts from it. */
  mark(): number {
    return this.seq
  }

  /** The paths the tab touched after `since`, in the order of its latest touch of each. */
  pathsBy(tabId: string, since: number): string[] {
    return [...(this.lastByTab.get(tabId) ?? [])]
      .filter(([, seq]) => seq > since)
      .toSorted((a, b) => a[1] - b[1])
      .map(([path]) => path)
  }

  /** The tabs that touched the path after `since`, in first-touch order. */
  by(path: string, since: number): string[] {
    const tabs: string[] = []
    for (const t of this.byPath.get(path) ?? []) {
      if (t.seq > since && !tabs.includes(t.tabId)) tabs.push(t.tabId)
    }
    return tabs
  }

  /** Each open session with the sessions that touched the same paths, after each one's own `since`. */
  overlaps(open: { tabId: string; since: number }[]): Overlap[] {
    const touched = open.map(({ tabId, since }) => {
      const paths = new Set<string>()
      for (const [path, seq] of this.lastByTab.get(tabId) ?? []) if (seq > since) paths.add(path)
      return { tabId, paths }
    })
    const result: Overlap[] = []
    for (const a of touched) {
      const others: string[] = []
      const paths = new Set<string>()
      for (const b of touched) {
        if (b.tabId === a.tabId) continue
        let any = false
        for (const p of a.paths) {
          if (!b.paths.has(p)) continue
          any = true
          paths.add(p)
        }
        if (any) others.push(b.tabId)
      }
      if (others.length > 0) result.push({ tabId: a.tabId, others, paths: [...paths].toSorted() })
    }
    return result
  }
}
