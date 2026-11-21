import { expect, test } from 'vitest'
import { terminalKeyAction } from './keys'

const key = (
  k: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
  type = 'keydown',
) => ({
  type,
  key: k,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  metaKey: !!mods.meta,
})

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
