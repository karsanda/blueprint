export interface KeyInput {
  type: string
  key: string
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
