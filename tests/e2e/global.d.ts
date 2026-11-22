import type { BlueprintApi, ReviewState } from '../../src/shared/api'
import type { TerminalProbe } from '../../src/shared/probe'

declare global {
  /** URLs a test's stub of shell.openExternal received, in the main process. */
  var openedUrls: string[] | undefined
  /** Notifications a test's stub of Notification.prototype.show received, in the main process. */
  var shown: Electron.Notification[] | undefined
  /** How many times a shown notification was closed, counted by a test's wrapper of its close. */
  var closedNotifications: number | undefined
  /** Calls a test's wrapper of the window's focus saw, in the main process. */
  var windowCalls: string[] | undefined

  interface Window {
    /** The API the preload script exposes. */
    blueprint: BlueprintApi
    blueprintProbe?: TerminalProbe
    /** The DataTransfer shared by one simulated tab drag in arrange.spec.ts. */
    dragData?: DataTransfer
    /** Every review state main sent since a test called watchReview. */
    reviewStates?: ReviewState[]
    /** Calls a test's wrapper of a pop-out window's focus saw, in popout.spec.ts. */
    focusCalls?: number
  }
}
