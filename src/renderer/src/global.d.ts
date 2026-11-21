import type { BlueprintApi } from '../../shared/api'
import type { TerminalProbe } from '../../shared/probe'

declare global {
  interface Window {
    blueprint: BlueprintApi
    blueprintProbe?: TerminalProbe
  }
}
