---
type: Note
title: Workspace
description: How Blueprint lays out panes and tabs, and remembers them
---

Code-level detail for [Arrange my panes](../../usecase/blueprint/arrange_my_panes.md) and [Run commands in a shell pane](../../usecase/blueprint/run_commands_in_a_shell_pane.md).

- Layout: dockview (React). Panes are dockview groups, tabs are dockview panels. dockview handles drop zones, splits, resize handles, floating groups and pop-out windows.
- Terminal tabs stay mounted when hidden (dockview `renderer: 'always'`). Only visible terminals should keep a WebGL renderer, because Chromium allows about 16 WebGL contexts; that matters once several sessions run, and is not built yet.
- Blueprint has no app menu: Electron's default one would take Ctrl+W, Ctrl+R and Ctrl+V from the terminals.
- Copy is Ctrl+Shift+C, handled by Blueprint. Paste is Chromium's own Ctrl+Shift+V and Shift+Insert: xterm receives them as a paste event and adds bracketed-paste marks. Handling paste in Blueprint as well would paste twice.
- Ligatures: the add-on cannot read the bundled Cascadia file from a sandboxed window, so it uses its built-in list of common ligatures (`=>`, `!=`, `===`, `->`, `<=` …). Blueprint denies all browser permission requests.
- dockview quirks: it sets an inline `outline: none` on each pane, so pane outlines need `!important`; its containers clip anything outside a pane, so pane views get 4px padding for the outer rule; it hides panes behind a zoomed one by giving their view zero width.
- Tests: Playwright's `dragTo` starts a native drag session, which hangs a visible Electron window on Wayland. The drag tests dispatch dockview's HTML5 drag events instead.
- The layout is saved as dockview JSON per Folder in Electron's user data folder, along with the Claude session ids for resume.
- Shells: the Developer's `$SHELL` in a pseudo-terminal, started in the Folder.
- Keys: Alt h/j/k/l focus, Alt Shift h/j/k/l move the tab, Alt Enter new shell, Alt c new Claude session, Alt z zoom, Ctrl Tab next tab. Alt avoids the desktop's own Super shortcuts.
- Presets: Agent and review, Two agents, Terminal heavy, Focus.
- Look: the Blueprint tokens (Default, Light, Dark) feed Tailwind, shadcn/ui on Base UI, dockview's theme and the xterm.js palette. Window chrome in Overpass, pane text in Cascadia Code with ligatures, icons from Lucide.
