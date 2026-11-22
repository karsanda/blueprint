import type { TerminalKind } from '../../../shared/api'
import type { PresetId } from '../workspace/presets'

export interface KeyInput {
  type: string
  key: string
  /** The physical key, which a keyboard layout or Shift does not change. */
  code: string
  isComposing?: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * The terminal keys Blueprint handles itself, as on Linux terminals: Ctrl+Shift+C copies,
 * Ctrl+Shift+V and Shift+Insert paste. Every other key, Ctrl+C included, goes to the program.
 */
export function terminalKeyAction(e: KeyInput): 'copy' | 'paste' | null {
  if (e.type !== 'keydown' || e.altKey || e.metaKey) return null
  const key = e.key.toLowerCase()
  if (e.ctrlKey && e.shiftKey && key === 'c') return 'copy'
  if (e.ctrlKey && e.shiftKey && key === 'v') return 'paste'
  if (!e.ctrlKey && e.shiftKey && key === 'insert') return 'paste'
  return null
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/** What a workspace key asks Blueprint to do with the panes. */
export type WorkspaceAction =
  | { kind: 'focus' | 'move'; direction: Direction }
  | { kind: 'next-tab' | 'previous-tab' | 'zoom' }
  | { kind: 'new'; tab: TerminalKind }
  | { kind: 'preset'; preset: PresetId }

const DIRECTIONS: Record<string, Direction> = { KeyH: 'left', KeyJ: 'down', KeyK: 'up', KeyL: 'right' }

const OTHER_KEYS: Record<string, WorkspaceAction> = {
  KeyT: { kind: 'new', tab: 'shell' },
  KeyN: { kind: 'new', tab: 'claude' },
  KeyZ: { kind: 'zoom' },
  Digit1: { kind: 'preset', preset: 'agent-and-review' },
  Digit2: { kind: 'preset', preset: 'two-agents' },
  Digit3: { kind: 'preset', preset: 'terminal-heavy' },
  Digit4: { kind: 'preset', preset: 'focus' },
}

/**
 * The workspace keys, as terminal emulators take them: Ctrl+Shift+H/J/K/L move the focus between panes,
 * adding Alt moves the tab; Ctrl+Shift+T and N open a shell and a Claude session, Ctrl+Shift+Z zooms, and
 * Ctrl+Shift+1 to 4 pick a preset; Ctrl+Tab and Ctrl+Shift+Tab switch tabs. Every other key goes to the
 * program, arrows included: programs tell Ctrl+Shift+arrows apart from Ctrl+arrows.
 */
export function workspaceKeyAction(e: KeyInput): WorkspaceAction | null {
  if (e.type !== 'keydown' || e.isComposing || e.metaKey || !e.ctrlKey) return null
  if (e.code === 'Tab') return e.altKey ? null : { kind: e.shiftKey ? 'previous-tab' : 'next-tab' }
  if (!e.shiftKey) return null
  const direction = DIRECTIONS[e.code]
  if (direction) return { kind: e.altKey ? 'move' : 'focus', direction }
  return e.altKey ? null : (OTHER_KEYS[e.code] ?? null)
}
