import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import type { TerminalKind } from '../../../shared/api'
import { useClaudeStatus } from '../status/store'
import { xtermTheme } from '../theme/xterm'
import { terminalKeyAction } from './keys'
import { useTerminalStatus } from './status'

const NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

/**
 * One tab's terminal: the xterm.js view and its program in the main process. A session lives
 * outside React, so remounting a panel (or React StrictMode) never starts a second program.
 */
export class TerminalSession {
  readonly tabId: string
  readonly kind: TerminalKind
  readonly term: Terminal
  private readonly fit = new FitAddon()
  private opened = false
  private started = false
  private observer: ResizeObserver | null = null
  private host: HTMLElement | null = null
  private frame = 0

  constructor(tabId: string, kind: TerminalKind) {
    this.tabId = tabId
    this.kind = kind
    this.term = new Terminal({
      fontFamily: '"Cascadia Code Variable", monospace',
      fontSize: 13,
      scrollback: 10_000,
      allowProposedApi: true,
      theme: xtermTheme,
    })
    this.term.loadAddon(this.fit)
    this.term.attachCustomKeyEventHandler((e) => {
      const action = terminalKeyAction(e)
      if (action === 'copy') {
        const selection = this.term.getSelection()
        if (selection) window.blueprint.writeClipboard(selection)
      }
      // Paste is Chromium's own Ctrl+Shift+V and Shift+Insert: its paste event reaches xterm,
      // which adds bracketed-paste marks when the program asks. Handling it here would paste twice.
      return action === null
    })
    // onKey, not onData: onData also carries focus reports, mouse reports and the terminal's answers.
    if (kind === 'claude') {
      this.term.onKey(({ domEvent }) => {
        // These keys move through a prompt's options without answering it.
        if (!NAVIGATION_KEYS.has(domEvent.key)) useClaudeStatus.getState().apply(tabId, { kind: 'typed' })
      })
    }
    this.term.onData((data) => window.blueprint.write(tabId, data))
    this.term.onResize(({ cols, rows }) => window.blueprint.resize(tabId, cols, rows))
    window.blueprint.onData(tabId, (data) => this.term.write(data))
    window.blueprint.onExit(tabId, (exit) => {
      useTerminalStatus.getState().set(tabId, { state: 'exited', exit })
      if (kind === 'claude') useClaudeStatus.getState().set(tabId, undefined)
    })
  }

  /** Shows the terminal in `el`, and starts its program the first time. */
  attach(el: HTMLElement): void {
    this.host = el
    if (!this.opened) {
      this.term.open(el)
      this.loadRenderers()
      this.opened = true
    } else if (this.term.element && this.term.element.parentElement !== el) {
      el.append(this.term.element)
    }
    this.observer?.disconnect()
    this.observer = new ResizeObserver(() => this.scheduleFit())
    this.observer.observe(el)
    if (!this.started) {
      this.started = true
      void this.start()
    }
  }

  detach(): void {
    this.observer?.disconnect()
    this.observer = null
  }

  /** Starts the program again in the same tab, below the old output. */
  async restart(): Promise<void> {
    this.term.write('\r\n')
    await this.start()
  }

  private async start(): Promise<void> {
    const status = useTerminalStatus.getState()
    status.set(this.tabId, { state: 'starting' })
    if (this.kind === 'claude') useClaudeStatus.getState().set(this.tabId, undefined)
    this.fitToHost()
    const { cols, rows } = this.term
    const result = await window.blueprint.startTerminal({ tabId: this.tabId, kind: this.kind, cols, rows })
    if (!result.ok) {
      status.set(this.tabId, { state: 'failed', failure: result.failure })
      return
    }
    status.set(this.tabId, { state: 'running' })
    if (this.kind === 'claude') useClaudeStatus.getState().set(this.tabId, 'idle')
    // The pane may have changed size while the program was starting.
    if (this.term.cols !== cols || this.term.rows !== rows) {
      window.blueprint.resize(this.tabId, this.term.cols, this.term.rows)
    }
  }

  /** Ligatures first, so they reach WebGL's glyph cache. Without WebGL, xterm keeps its DOM renderer. */
  private loadRenderers(): void {
    this.term.loadAddon(new LigaturesAddon())
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      this.term.loadAddon(webgl)
    } catch {
      // No WebGL2 here: the DOM renderer draws the terminal instead.
    }
  }

  private scheduleFit(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.fitToHost())
  }

  /**
   * Fits the terminal to its pane. A pane with no size (hidden behind a zoomed pane) is skipped:
   * fitting it would squeeze the program to 2 columns and make it redraw everything.
   */
  private fitToHost(): void {
    if (!this.host || this.host.clientWidth === 0 || this.host.clientHeight === 0) return
    this.fit.fit()
  }
}

const sessions = new Map<string, TerminalSession>()

export function getSession(tabId: string, kind: TerminalKind): TerminalSession {
  let session = sessions.get(tabId)
  if (!session) {
    session = new TerminalSession(tabId, kind)
    sessions.set(tabId, session)
  }
  return session
}

export function findSession(tabId: string): TerminalSession | undefined {
  return sessions.get(tabId)
}
