import type { TerminalProbe } from '../../src/shared/probe'

declare global {
  interface Window {
    blueprintProbe?: TerminalProbe
  }
}
