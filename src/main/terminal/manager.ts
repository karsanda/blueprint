import * as pty from 'node-pty'
import type { ExitInfo } from '../../shared/api'
import { e2eLog } from '../e2e'
import { foregroundProgram, foregroundProgramMac } from './foreground'
import type { SpawnSpec } from './spec'

/** Where terminal output and exits go: the window, in the app. */
export interface TerminalSink {
  data(tabId: string, data: string): void
  exit(tabId: string, exit: ExitInfo): void
}

/**
 * Runs one pseudo-terminal per tab. Starting a tab again replaces its terminal. Only the
 * current terminal of a tab reports output and its exit, so a replaced one stays silent.
 */
export class TerminalManager {
  private readonly terminals = new Map<string, pty.IPty>()
  private readonly sink: TerminalSink
  private closed = false

  constructor(sink: TerminalSink) {
    this.sink = sink
  }

  /** Throws once Blueprint quits: a start still in flight then, such as Claude's, must not outlive it. */
  start(tabId: string, spec: SpawnSpec, cols: number, rows: number): number {
    if (this.closed) throw new Error('Blueprint is quitting.')
    this.kill(tabId)
    const term = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: clampSize(cols),
      rows: clampSize(rows),
      cwd: spec.cwd,
      env: spec.env,
    })
    this.terminals.set(tabId, term)
    term.onData((data) => {
      if (this.terminals.get(tabId) === term) this.sink.data(tabId, data)
    })
    term.onExit(({ exitCode, signal }) => {
      if (this.terminals.get(tabId) !== term) return
      this.terminals.delete(tabId)
      this.sink.exit(tabId, signal ? { exitCode, signal } : { exitCode })
    })
    e2eLog(`terminal ${tabId} started, pid ${term.pid}`)
    return term.pid
  }

  write(tabId: string, data: string): void {
    this.terminals.get(tabId)?.write(data)
  }

  resize(tabId: string, cols: number, rows: number): void {
    this.terminals.get(tabId)?.resize(clampSize(cols), clampSize(rows))
  }

  /**
   * The program a tab's terminal runs in its foreground, or null when its shell has the foreground or it has
   * none: from /proc on Linux, from `ps` on macOS.
   */
  async foreground(tabId: string): Promise<string | null> {
    const term = this.terminals.get(tabId)
    if (!term) return null
    return process.platform === 'darwin' ? foregroundProgramMac(term.pid) : foregroundProgram(term.pid)
  }

  kill(tabId: string): void {
    const term = this.terminals.get(tabId)
    if (!term) return
    this.terminals.delete(tabId)
    term.kill()
  }

  killAll(): void {
    for (const tabId of this.terminals.keys()) this.kill(tabId)
  }

  /** Ends every terminal for good, as Blueprint quits: no terminal starts after it. */
  close(): void {
    this.closed = true
    e2eLog(`closing ${this.terminals.size} terminals`)
    this.killAll()
  }
}

/** node-pty needs whole numbers of at least 2; a pane without a size yet proposes none. */
function clampSize(n: number): number {
  return Number.isFinite(n) ? Math.max(2, Math.floor(n)) : 2
}
