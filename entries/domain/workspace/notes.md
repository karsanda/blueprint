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
- Claude tabs and shell tabs can close, never the last of their kind, and closing ends the tab's program (see [Claude sessions](../claude_sessions/notes.md) and Several shells below). Changes and Difference keep dockview's `hideClose`, which also stops middle-click.
- The window only shows Blueprint: navigation is refused and `window.open` is denied. Web links, such as OSC 8 links in terminal output, open in the Developer's browser.
- Tests: Playwright's `dragTo` starts a native drag session, which hangs a visible Electron window on Wayland. The drag tests dispatch dockview's HTML5 drag events instead.
- Remembering the layout:
  - One file per Folder: `<user data>/layouts/<first 16 hex digits of sha256(Folder path)>.json`, holding the dockview JSON and the window's bounds. It is written whole to a temporary file, then renamed over the old one.
  - The renderer sends `api.toJSON()` 500 ms after the last layout change. A save still waiting when the window closes is sent at once. dockview leaves a zoom before it serialises, so the sizes it saves are the unzoomed ones and the zoom is recorded apart; changes made while zoomed are saved too. On open the renderer leaves a zoom that comes back, so a Folder closed while zoomed reopens with the layout it had before the zoom, and nothing zoomed.
  - The main process saves the window's normal bounds and whether it is maximized, 500 ms after a move or resize and again on close.
  - On open, the renderer loads the saved JSON with `api.fromJSON`. A file that is missing or broken, holds no Claude tab, or holds a panel that is not Changes, Difference, a Claude tab (`claude-<n>`) or a shell tab (`shell-<n>`), gives the default layout. Claude and shell tabs under any number are kept: the first ones may have closed. A saved layout missing Changes, Difference or every shell tab, such as one saved before the review panes existed, gets that pane added beside its first Claude tab, where the default layout puts it. A missing shell comes back as `shell-1`. Panels keep `renderer: 'always'` through the JSON, so terminals stay mounted.
  - The window opens at its saved bounds when at least 100 by 100 pixels of them fall on a display's work area; otherwise at the default size. A Folder picked after the window opened moves the window to that Folder's saved bounds when they are on screen, and leaves it where it is otherwise. On Wayland no app can set its window's place, so only the size and the maximized state come back there. Saved bounds bigger than the display are cut to its work area and moved inside it. A file written by a newer Blueprint (a `version` above 1) is never overwritten.
  - Every shell tab starts a fresh shell in the Folder, under its saved name; its output and programs do not come back. Each Claude tab resumes the conversation saved with it (see [Claude sessions](../claude_sessions/notes.md), "Resume after reopening").
- Shells: the Developer's `$SHELL` in a pseudo-terminal, started in the Folder.
- Several shells, detail for [Run commands in a shell pane](../../usecase/blueprint/run_commands_in_a_shell_pane.md), Slice 2:
  - Starting: every group that holds a shell tab gets a header action named "New shell", with Lucide's `SquareTerminal` icon. A group that holds both kinds shows it beside Claude's `+`, before zoom. It adds a tab `shell-<n>` titled `Shell <n>` to that group, active, with the keyboard in it. `n` follows the Claude rule: one past the highest open shell number and every shell number used earlier in the run. The first, `shell-1`, is titled `Shell`.
  - Renaming: double-click a shell tab's title, as for a Claude tab. The name is the dockview panel title, so the layout file saves it.
  - Closing: shell tabs get a close action (button and middle-click), except the last open shell tab. First the renderer asks main what the shell's terminal runs in its foreground:
    - Main reads the terminal's foreground process group, field 8 (`tpgid`) of `/proc/<shell pid>/stat`.
    - When that is the shell's own pid, the shell sits at its prompt, and the tab closes at once.
    - Otherwise Blueprint asks first, in its close dialog: "Close Shell 2?", "It is still running <program>.", with "Keep it" and "Close shell". The program's name is `/proc/<tpgid>/comm`.
    - A shell that exited, or whose foreground cannot be read, closes at once.
    - Closing ends the tab's terminal, which hangs up the programs in it.
  - Why the foreground process group and not the program's name: the shell's own name cannot be compared reliably. A `#!/usr/bin/env node` script reads as `node`, and a login shell as `-zsh`. Checked in a pseudo-terminal with `/bin/sh`, bash and zsh: `tpgid` is the shell's pid at the prompt, and `sleep`'s while `sleep 5` runs.
  - Restored layouts accept `shell-<n>` tabs (terminal, kind `shell`). See Remembering the layout.
  - Known gaps: the check is Linux only; macOS can read the same with `ps -o tpgid=`. A job sent to the background with `&` does not count as running, and closing ends it with the shell.
  - Checked in the real app: the built app with the Developer's zsh and its usual prompt, in a scratch Folder, on 2026-11-22.
    - New shell opened Shell 2 as the active tab, and `pwd` in it printed the Folder.
    - `vim` (an alias for nvim) in Shell 2 made closing it ask: "Close Shell 2?", "It is still running nvim." After Close shell, both nvim processes were gone.
    - Shell 3, at its prompt, closed at once with no dialog.
    - Shell 4, renamed "dev server", came back under that name after reopening, as a fresh shell without its old output.
- Keys: Alt h/j/k/l focus, Alt Shift h/j/k/l move the tab, Alt Enter new shell, Alt c new Claude session, Alt z zoom, Ctrl Tab next tab. Alt avoids the desktop's own Super shortcuts.
- Presets: Agent and review, Two agents, Terminal heavy, Focus.
- Look: the Blueprint tokens (Default, Light, Dark) feed Tailwind, shadcn/ui on Base UI, dockview's theme and the xterm.js palette. Window chrome in Overpass, pane text in Cascadia Code with ligatures, icons from Lucide.
