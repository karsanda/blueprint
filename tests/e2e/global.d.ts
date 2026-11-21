import type { TerminalProbe } from '../../src/shared/probe'

declare global {
  interface Window {
    blueprintProbe?: TerminalProbe
    /** The DataTransfer shared by one simulated tab drag in arrange.spec.ts. */
    dragData?: DataTransfer
  }
}
