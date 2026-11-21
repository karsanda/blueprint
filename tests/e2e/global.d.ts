import type { TerminalProbe } from '../../src/shared/probe'

declare global {
  /** URLs a test's stub of shell.openExternal received, in the main process. */
  var openedUrls: string[] | undefined
  /** Notifications a test's stub of Notification.prototype.show received, in the main process. */
  var shown: Electron.Notification[] | undefined
  /** Calls a test's wrapper of the window's focus saw, in the main process. */
  var windowCalls: string[] | undefined

  interface Window {
    blueprintProbe?: TerminalProbe
    /** The DataTransfer shared by one simulated tab drag in arrange.spec.ts. */
    dragData?: DataTransfer
  }
}
