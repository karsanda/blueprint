import type { BlueprintApi } from '../../shared/api'

declare global {
  interface Window {
    blueprint: BlueprintApi
  }
}
