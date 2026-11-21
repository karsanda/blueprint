import type { TerminalProbe } from '../../src/shared/probe'

declare global {
  /** URLs a test's stub of shell.openExternal received, in the main process. */
  var openedUrls: string[] | undefined

  interface Window {
    blueprintProbe?: TerminalProbe
    /** The DataTransfer shared by one simulated tab drag in arrange.spec.ts. */
    dragData?: DataTransfer
  }
}
