import type { MenuItemConstructorOptions } from 'electron'
import { expect, test } from 'vitest'
import { macMenuTemplate } from './menu'

/** A menu's items as their roles, `-` for a separator. */
const roles = (submenu: MenuItemConstructorOptions['submenu']) =>
  (Array.isArray(submenu) ? submenu : []).map((i) => i.role ?? (i.type === 'separator' ? '-' : i.label))

test('the macOS menu is Blueprint, Edit and Window, all by role', () => {
  const menu = macMenuTemplate()
  expect(menu.map((m) => m.label ?? m.role)).toEqual(['Blueprint', 'Edit', 'Window'])
  const [blueprint, edit, win] = menu.map((m) => m.submenu)
  expect(roles(blueprint)).toEqual(['about', '-', 'hide', 'hideOthers', 'unhide', '-', 'quit'])
  expect(roles(edit)).toEqual(['undo', 'redo', '-', 'cut', 'copy', 'paste', 'selectAll'])
  expect(roles(win)).toEqual(['minimize', 'zoom', '-', 'front'])
  const all = menu.flatMap((m) => roles(m.submenu))
  for (const taken of ['reload', 'forceReload', 'toggleDevTools', 'close']) expect(all).not.toContain(taken)
})
