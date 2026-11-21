---
type: Note
title: Workspace
description: How Blueprint lays out panes and tabs, and remembers them
---

Code-level detail for [Arrange my panes](../../usecase/blueprint/arrange_my_panes.md) and [Run commands in a shell pane](../../usecase/blueprint/run_commands_in_a_shell_pane.md).

- Layout: dockview (React). Panes are dockview groups, tabs are dockview panels. dockview handles drop zones, splits, resize handles, floating groups and pop-out windows.
- Default layout: Changes, a narrow pane on the left at full height; Claude in the middle and Difference on the right; Shell below them both. The Changes and Difference panes are described in [Review](../review/notes.md).
- Terminal tabs stay mounted when hidden (dockview `renderer: 'always'`). Only visible terminals should keep a WebGL renderer, because Chromium allows about 16 WebGL contexts; that matters once several sessions run, and is not built yet.
- Blueprint has no app menu: Electron's default one would take Ctrl+W, Ctrl+R and Ctrl+V from the terminals.
- Copy is Ctrl+Shift+C, handled by Blueprint. Paste is Chromium's own Ctrl+Shift+V and Shift+Insert: xterm receives them as a paste event and adds bracketed-paste marks. Handling paste in Blueprint as well would paste twice.
- Ligatures: the add-on cannot read the bundled Cascadia file from a sandboxed window, so it uses its built-in list of common ligatures (`=>`, `!=`, `===`, `->`, `<=` …). Blueprint denies all browser permission requests.
- dockview quirks: it sets an inline `outline: none` on each pane, so pane outlines need `!important`; its containers clip anything outside a pane, so pane views get 4px padding for the outer rule; it hides panes behind a zoomed one by giving their view zero width. A terminal in a pane with no size is never fitted: fitting would squeeze its program to 2 columns.
- Only Claude tabs can close, never the last one, and closing ends the tab's program (see [Claude sessions](../claude_sessions/notes.md)). Other tabs keep dockview's `hideClose`, which also stops middle-click.
- The window only shows Blueprint: navigation is refused and `window.open` is denied. Web links, such as OSC 8 links in terminal output, open in the Developer's browser.
- Tests: Playwright's `dragTo` starts a native drag session, which hangs a visible Electron window on Wayland. The drag tests dispatch dockview's HTML5 drag events instead.
- Remembering the layout:
  - One file per Folder: `<user data>/layouts/<first 16 hex digits of sha256(Folder path)>.json`, holding the dockview JSON and the window's bounds. It is written whole to a temporary file, then renamed over the old one.
  - The renderer sends `api.toJSON()` 500 ms after the last layout change. A save still waiting when the window closes is sent at once. dockview leaves a zoom before it serialises, so the sizes it saves are the unzoomed ones and the zoom is recorded apart; changes made while zoomed are saved too. On open the renderer leaves a zoom that comes back, so a Folder closed while zoomed reopens with the layout it had before the zoom, and nothing zoomed.
  - The main process saves the window's normal bounds and whether it is maximized, 500 ms after a move or resize and again on close.
  - On open, the renderer loads the saved JSON with `api.fromJSON`. A file that is missing, broken, or holds a panel that is not one of the four default panes (Claude and Shell terminals, Changes, Difference) gives the default layout. A saved layout missing one of the default panes, such as one saved before the review panes existed, gets that pane added where the default layout puts it. Panels keep `renderer: 'always'` through the JSON, so terminals stay mounted.
  - The window opens at its saved bounds when at least 100 by 100 pixels of them fall on a display's work area; otherwise at the default size. A Folder picked after the window opened moves the window to that Folder's saved bounds when they are on screen, and leaves it where it is otherwise. On Wayland no app can set its window's place, so only the size and the maximized state come back there. Saved bounds bigger than the display are cut to its work area and moved inside it. A file written by a newer Blueprint (a `version` above 1) is never overwritten.
  - Programs start fresh in the restored panes. Saving the Claude session ids for resume comes with [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), Slice 2.
- Shells: the Developer's `$SHELL` in a pseudo-terminal, started in the Folder.
- Keys: Alt h/j/k/l focus, Alt Shift h/j/k/l move the tab, Alt Enter new shell, Alt c new Claude session, Alt z zoom, Ctrl Tab next tab. Alt avoids the desktop's own Super shortcuts.
- Presets: Agent and review, Two agents, Terminal heavy, Focus.
- Look: the Blueprint tokens (Default, Light, Dark) feed Tailwind, shadcn/ui on Base UI, dockview's theme and the xterm.js palette. Window chrome in Overpass, pane text in Cascadia Code with ligatures, icons from Lucide.
