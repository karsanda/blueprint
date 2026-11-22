import type { MenuItemConstructorOptions } from 'electron'

/**
 * The macOS menu: without one, Cmd+C, Cmd+V and Cmd+Q do nothing there. Everything is a standard role, so
 * Copy and Paste reach a terminal as copy and paste events. No View menu (reload, developer tools) and no
 * Close Window: those keys would leave Blueprint's terminals or close the one window.
 */
export function macMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Blueprint',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ]
}
