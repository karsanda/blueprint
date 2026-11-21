---
type: Note
title: Workspace
description: How Blueprint lays out panes and tabs, and remembers them
---

Code-level detail for [Arrange my panes](../../usecase/blueprint/arrange_my_panes.md) and [Run commands in a shell pane](../../usecase/blueprint/run_commands_in_a_shell_pane.md).

- Layout: dockview (React). Panes are dockview groups, tabs are dockview panels. dockview handles drop zones, splits, resize handles, floating groups and pop-out windows.
- Terminal tabs stay mounted when hidden, and only visible terminals keep a WebGL renderer, because Chromium allows about 16 WebGL contexts.
- The layout is saved as dockview JSON per Folder in Electron's user data folder, along with the Claude session ids for resume.
- Shells: the Developer's `$SHELL` in a pseudo-terminal, started in the Folder.
- Keys: Alt h/j/k/l focus, Alt Shift h/j/k/l move the tab, Alt Enter new shell, Alt c new Claude session, Alt z zoom, Ctrl Tab next tab. Alt avoids the desktop's own Super shortcuts.
- Presets: Agent and review, Two agents, Terminal heavy, Focus.
- Look: the Blueprint tokens (Default, Light, Dark) feed Tailwind, shadcn/ui on Base UI, dockview's theme and the xterm.js palette. Window chrome in Overpass, pane text in Cascadia Code with ligatures, icons from Lucide.
