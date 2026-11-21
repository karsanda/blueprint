import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ReviewRange } from '../../shared/api'

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

/** Which paths Claude touched: in the current turn, and at any time in the session. */
export class TouchLog {
  private turn = 0
  private readonly last = new Map<string, number>()

  startTurn(): void {
    this.turn += 1
  }

  touch(path: string): void {
    this.last.set(path, this.turn)
  }

  touched(path: string, range: ReviewRange): boolean {
    const at = this.last.get(path)
    if (at === undefined) return false
    return range === 'session' || at === this.turn
  }
}
