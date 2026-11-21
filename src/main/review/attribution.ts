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
  private readonly touches: { path: string; tabId: string; seq: number }[] = []

  touch(path: string, tabId: string): void {
    this.touches.push({ path, tabId, seq: ++this.seq })
  }

  /** The current sequence number. A range starts from it. */
  mark(): number {
    return this.seq
  }

  /** The tabs that touched the path after `since`, in first-touch order. */
  by(path: string, since: number): string[] {
    const tabs: string[] = []
    for (const t of this.touches) {
      if (t.path === path && t.seq > since && !tabs.includes(t.tabId)) tabs.push(t.tabId)
    }
    return tabs
  }

  /** Each open session with the sessions that touched the same paths, after each one's own `since`. */
  overlaps(open: { tabId: string; since: number }[]): Overlap[] {
    const touched = open.map(({ tabId, since }) => ({
      tabId,
      paths: new Set(this.touches.filter((t) => t.tabId === tabId && t.seq > since).map((t) => t.path)),
    }))
    const result: Overlap[] = []
    for (const a of touched) {
      const others: string[] = []
      const paths = new Set<string>()
      for (const b of touched) {
        if (b.tabId === a.tabId) continue
        const shared = [...a.paths].filter((p) => b.paths.has(p))
        if (shared.length === 0) continue
        others.push(b.tabId)
        for (const p of shared) paths.add(p)
      }
      if (others.length > 0) result.push({ tabId: a.tabId, others, paths: [...paths].toSorted() })
    }
    return result
  }
}
