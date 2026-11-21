import type { ClaudeStatus } from '../../../shared/api'

export const STATUS_LABEL: Record<ClaudeStatus, string> = {
  idle: 'Idle',
  working: 'Working',
  'needs-you': 'Needs you',
}
