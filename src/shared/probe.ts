/** What e2e tests can read from the renderer. It exists only when BLUEPRINT_E2E=1. */
export interface TerminalProbe {
  /** The active buffer's lines, right-trimmed, joined with newlines. */
  text(tabId: string): string
  size(tabId: string): { cols: number; rows: number } | null
  /** How many frames the terminal drew since the first call for it, which starts the count at 0. */
  renders(tabId: string): number
  focus(tabId: string): void
  selectAll(tabId: string): void
}
