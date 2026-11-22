import { expect, test } from 'vitest'
import { terminalKeyAction, workspaceKeyAction } from './keys'

/** The physical key a character sits on, as `KeyboardEvent.code` names it. */
const codeOf = (k: string): string =>
  /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : /^\d$/.test(k) ? `Digit${k}` : k

const key = (
  k: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; composing?: boolean } = {},
  type = 'keydown',
) => ({
  type,
  key: k,
  code: codeOf(k),
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: !!mods.meta,
  isComposing: !!mods.composing,
})

const cs = { ctrl: true, shift: true }
const csa = { ctrl: true, shift: true, alt: true }

test('Ctrl+Shift+C copies', () => {
  expect(terminalKeyAction(key('C', { ctrl: true, shift: true }))).toBe('copy')
  expect(terminalKeyAction(key('c', { ctrl: true, shift: true }))).toBe('copy')
})

test('Ctrl+Shift+V and Shift+Insert paste', () => {
  expect(terminalKeyAction(key('V', { ctrl: true, shift: true }))).toBe('paste')
  expect(terminalKeyAction(key('Insert', { shift: true }))).toBe('paste')
})

test('Ctrl+C and Ctrl+V go to the program', () => {
  expect(terminalKeyAction(key('c', { ctrl: true }))).toBeNull()
  expect(terminalKeyAction(key('v', { ctrl: true }))).toBeNull()
  expect(terminalKeyAction(key('C', { ctrl: true, shift: true, alt: true }))).toBeNull()
})

test('only keydown acts', () => {
  expect(terminalKeyAction(key('V', { ctrl: true, shift: true }, 'keyup'))).toBeNull()
})

test('Ctrl+Shift+H, J, K and L move the focus', () => {
  expect(['H', 'J', 'K', 'L'].map((k) => workspaceKeyAction(key(k, cs)))).toEqual([
    { kind: 'focus', direction: 'left' },
    { kind: 'focus', direction: 'down' },
    { kind: 'focus', direction: 'up' },
    { kind: 'focus', direction: 'right' },
  ])
})

test('adding Alt moves the tab instead', () => {
  expect(['H', 'J', 'K', 'L'].map((k) => workspaceKeyAction(key(k, csa)))).toEqual([
    { kind: 'move', direction: 'left' },
    { kind: 'move', direction: 'down' },
    { kind: 'move', direction: 'up' },
    { kind: 'move', direction: 'right' },
  ])
})

test('Ctrl+Shift+T, N and Z open tabs and zoom', () => {
  expect(workspaceKeyAction(key('T', cs))).toEqual({ kind: 'new', tab: 'shell' })
  expect(workspaceKeyAction(key('N', cs))).toEqual({ kind: 'new', tab: 'claude' })
  expect(workspaceKeyAction(key('Z', cs))).toEqual({ kind: 'zoom' })
})

test('Ctrl+Shift+1 to 4 go to the program', () => {
  // With Shift held, the digit keys type `!`, `@`, `#` and `$`: the physical key is what counts.
  expect(
    ['!', '@', '#', '$'].map((k, i) => workspaceKeyAction({ ...key(k, cs), code: `Digit${i + 1}` })),
  ).toEqual([null, null, null, null])
})

test('Ctrl+Tab and Ctrl+Shift+Tab switch tabs', () => {
  expect(workspaceKeyAction(key('Tab', { ctrl: true }))).toEqual({ kind: 'next-tab' })
  expect(workspaceKeyAction(key('Tab', cs))).toEqual({ kind: 'previous-tab' })
})

test('keys programs can tell apart are left alone', () => {
  expect(workspaceKeyAction(key('ArrowLeft', cs))).toBeNull()
  expect(workspaceKeyAction(key('h', { ctrl: true }))).toBeNull()
  expect(workspaceKeyAction(key('c', { alt: true }))).toBeNull()
  expect(workspaceKeyAction(key('C', cs))).toBeNull()
  expect(workspaceKeyAction(key('V', cs))).toBeNull()
  expect(workspaceKeyAction(key('Z', csa))).toBeNull()
  expect(workspaceKeyAction(key('H', { ...cs, meta: true }))).toBeNull()
})

test('a key up, or a key while composing, is left alone', () => {
  expect(workspaceKeyAction(key('H', cs, 'keyup'))).toBeNull()
  expect(workspaceKeyAction(key('H', { ...cs, composing: true }))).toBeNull()
})
