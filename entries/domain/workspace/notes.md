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
    - The group's leader is the first command of a pipeline. It may end while the rest still runs, as in `cat log | less`, and then its `/proc` entry is gone. The program is then the first process left in that group and in the shell's session, from each `/proc/<pid>/stat`. When none is left, the job has ended.
    - A shell that exited, or whose `/proc/<pid>/stat` cannot be read, closes at once.
    - Closing ends the tab's terminal, which hangs up the programs in it.
  - Why the foreground process group and not the program's name: the shell's own name cannot be compared reliably. A `#!/usr/bin/env node` script reads as `node`, and a login shell as `-zsh`. Checked in a pseudo-terminal with `/bin/sh`, bash and zsh: `tpgid` is the shell's pid at the prompt, and `sleep`'s while `sleep 5` runs.
  - Restored layouts accept `shell-<n>` tabs (terminal, kind `shell`). See Remembering the layout.
  - Known gaps: the check is Linux only; macOS can read the same with `ps -o tpgid=`. A job sent to the background with `&` does not count as running, and closing ends it with the shell. A program a shell's key binding starts, such as fzf from zsh's Alt+c, runs in the shell's own process group, so it does not count as running either.
  - Checked in the real app: the built app with the Developer's zsh and its usual prompt, in a scratch Folder, on 2026-11-22.
    - New shell opened Shell 2 as the active tab, and `pwd` in it printed the Folder.
    - `vim` (an alias for nvim) in Shell 2 made closing it ask: "Close Shell 2?", "It is still running nvim." After Close shell, both nvim processes were gone.
    - Shell 3, at its prompt, closed at once with no dialog.
    - Shell 4, renamed "dev server", came back under that name after reopening, as a fresh shell without its old output.
- Presets, keys, floating and pop-out: see the section below.

## Presets, keys, floating and pop-out

Detail for [Arrange my panes](../../usecase/blueprint/arrange_my_panes.md), Slice 3. Changes and Difference stay two panes here; merging them into one comes after the MVP ([#35](https://github.com/karsanda/blueprint/issues/35)).

### Presets

- The Developer picks a preset from a Layout menu at the right end of the top bar, which lists each preset with its key, or with Ctrl+Shift+1 to 4.
- The four presets:

  | Key | Preset | Panes |
  | --- | --- | --- |
  | 1 | Agent and review | The default layout: Changes on the left at full height, Claude in the middle and Difference on the right, Shell below them both. |
  | 2 | Two agents | Changes on the left at full height, with Difference as a tab behind it. Claude and Claude 2 side by side, Shell below them both. |
  | 3 | Terminal heavy | Claude on the left, with Changes and Difference as tabs behind it. Shell and Shell 2 stacked on the right. |
  | 4 | Focus | One pane holding every tab, with Claude active. |

- Tabs already open:
  - Every open tab gets a place, and a preset never closes one.
  - The lowest-numbered Claude tab is "Claude" in the table, and the next one "Claude 2"; the same goes for shells.
  - Further Claude tabs stack in the last Claude pane, and further shells in the last Shell pane, in number order.
  - Two agents with one Claude tab open opens a new Claude session for its second pane, as `+` does. Terminal heavy with one shell open opens a new shell the same way. That tab opens in the background, so the keyboard stays where the keyboard rule puts it.
- Every pane shows its first tab, except that the tab that had the keyboard before keeps it, in whichever pane it lands. Focus is the exception: its active tab, with the keyboard, is the Claude tab that had the keyboard, or else the lowest-numbered Claude tab. Changes keeps its 250-pixel width; the other panes share the rest evenly.
- A preset docks floating panes and closes pop-out windows, so their tabs take their places in it.
- How: the renderer builds the preset's dockview JSON from the open panels, their titles and parameters (a Claude tab keeps its saved conversation). It loads that with `api.fromJSON(json, { reuseExistingPanels: true })`, which moves the open panels into place rather than making them anew. Terminals would survive either way, because a terminal session lives outside React.
- Constraint: a preset must not look like closing tabs. Whatever treats a removed Claude tab as a closed session must keep each tab's session across a preset. Today that is the review's `onDidRemovePanel`, which ends the tab's review session in the Changes pane. With `reuseExistingPanels` no panel is removed, so the review needs nothing.
- While `fromJSON` stages the panels, each tab is briefly active, and a terminal tab queues a focus. A queued focus does nothing once its tab is no longer active; otherwise it would make dockview activate that tab again, after the preset.

### Keys

Blueprint takes Ctrl+Shift keys, as terminal emulators do; it already takes Ctrl+Shift+C and V. A program in a terminal cannot tell Ctrl+Shift+H from Ctrl+H, so nothing a program could use is lost. That holds for letters, digits, Tab and Enter, but not for arrows: a program sees Ctrl+Shift+← apart from Ctrl+←, and some use it to select a word, so Blueprint leaves arrows alone. Moving a tab adds Alt to the focus keys; a program sees that as Ctrl+Alt+letter, which shells and nvim rarely bind. Alt keys alone stay with the programs: Alt c, h, l, z and Enter are common shell and fzf bindings.

| Action | Key |
| --- | --- |
| Focus the pane to the left / below / above / right | Ctrl+Shift+H / J / K / L |
| Move the active tab to the pane in that direction | Ctrl+Shift+Alt+H / J / K / L |
| Next / previous tab in the pane, wrapping | Ctrl+Tab / Ctrl+Shift+Tab |
| New shell / new Claude session | Ctrl+Shift+T / Ctrl+Shift+N |
| Zoom the pane in and out | Ctrl+Shift+Z |
| Preset 1 to 4 | Ctrl+Shift+1 to 4 |

- One key table, in `src/renderer/src/terminal/keys.ts` beside copy and paste, maps a key to an action. A capture-phase `keydown` listener on the main window, and on each pop-out window as it opens, consults it, whichever element has the keyboard, terminals included. It stops a handled key there, so the key never reaches the terminal or its program. Keys pressed while an input method is composing, and keys typed in the rename field, are left alone.
- Keys match on `KeyboardEvent.code` (`KeyH`, `Digit1`, `Tab`) with the modifiers held exactly, so a keyboard layout or Shift changing the character does not matter. Ctrl+Shift+H focuses only with Alt up; with Alt down it moves the tab.
- Direction is by where the panes sit on screen: the nearest pane whose centre lies that way, as dockview's `adjacentGroupInDirection` finds it. Blueprint does the search itself so it can skip panes with no size: dockview keeps a popped-out pane's place in the grid as a hidden pane, which must never take a tab or the keyboard. From the Shell pane of the default layout, Claude and Difference tie for "above"; either one takes the keyboard.
- A key acts from the pane whose terminal has the keyboard, and else from dockview's active pane: dockview does not always make a pane active before the next key once its terminal takes the keyboard. At the window's edge the key does nothing. Direction keys move among the main window's docked panes. A floating pane or a pop-out window takes the other keys for its own panes.
- A moved tab becomes the active tab of the pane it joins and keeps the keyboard. Moving the last tab out of a pane closes that pane, as dragging does.
- Ctrl+Shift+T opens the shell in the pane with the keyboard when that pane holds a shell, else in the first pane that does. Ctrl+Shift+N works the same way for Claude.

### Floating and pop-out

- Each pane's header gets a `⋯` menu before zoom, offering:
  - Float, for a docked pane;
  - Pop out, for a docked or floating pane;
  - Dock, for a floating pane or a popped-out one.

  dockview also floats a tab dragged with Shift held.
- Float: a dockview floating group, above the layout and kept inside the window.
- Dock, for a floating pane: dockview forgets where a floating pane came from, so Blueprint remembers it while it runs. When a pane floats, Blueprint notes the pane beside it and the side it was on. Dock puts it back there while that pane is still open, and otherwise as a new column at the right edge. After a reopen there is no record, so Dock uses the right edge.
- Dock, for a popped-out pane, does what closing its window does.
- Pop out: a dockview pop-out group in a window of its own. dockview refuses a pop-out URL on `file:`, so:
  - Blueprint serves its renderer from `blueprint://app/`, a privileged standard and secure scheme answered with `protocol.handle`, serving only files under the built renderer folder;
  - the pop-out page is `blueprint://app/popout.html`, an empty page;
  - the main window's open handler allows only that URL, and pop-out windows refuse navigation and new windows as the main window does, except the first load of their own page, which is itself a navigation;
  - dev runs keep the dev server's URL.
- Closing a pop-out window puts its pane back where dockview keeps its place: the spot it left in the main window's grid, or floating again if it was floating when it popped out. When that spot is gone, dockview puts it at the grid's edge. Pop-out windows come back when the Folder reopens, as dockview restores them; on Wayland only their size comes back.
- Every Blueprint window shows the same title, so "Needs you" shows on a pop-out too. A notification click for a session in a pop-out raises that window.
- The pane menu and the close question open in the window that holds the pane (their portal's container is that window's `body`). The menus and the close question sit above floating panes, which dockview puts at z-index 997.
- A layout with floating or pop-out groups restores like any other. Its panels count toward the checks in Remembering the layout.
- A pop-out window shares the renderer process with the main window, so the limit of about 16 WebGL contexts is shared too.
- Every terminal is opened against the main window, even one first shown in a pop-out (it opens in a hidden element of the main window, then moves). xterm draws and parses with the window it was opened in, and asks for a new frame only when none is waiting. A frame asked of a pop-out window that then closes never comes, so a terminal tied to that window would never draw again. The main window lasts as long as Blueprint.
- Code that reads the focus or asks for a frame uses the window of the element it acts on: a pop-out has its own `document`. The rename field in a pop-out keeps the keyboard because of this.
- Known gap: while the main window is minimized its frames may pause, and with them the drawing of terminals in pop-out windows. Not checked: the test display never hides a minimized window.
- Checked in the real app on 2026-11-22: the built app with the Developer's zsh, LazyVim and fzf, and the test Claude, in a scratch Folder.
  - Each preset from the Layout menu and from its key gave its panes: Two agents opened Claude 2, and Terminal heavy opened Shell 2.
  - From Claude, Ctrl+Shift+L, H, J, K and H went to Difference, Claude, Shell, Claude and Changes. Ctrl+Shift+Alt+K moved Shell into the Claude pane.
  - In zsh, Ctrl+← still moved back a word: `echo one two`, then Ctrl+←, X and Enter printed `one Xtwo`. Alt+c still opened fzf's cd widget.
  - Float, then Dock, put Difference back to the right of Claude.
  - In a popped-out Shell pane, nvim drew, took keys and redrew when the window shrank from 134×20 to 120×29. Closing the window put the pane back in the main window with nvim still running.
- Checked in a throwaway spike on 2026-11-22, in the built app with the test shell and test Claude, with the renderer on `blueprint://`:
  - a Shell pane and a Claude pane each popped out, in the Blueprint look and still on WebGL;
  - typing, output, resizing the window, Ctrl+Shift+C and V, and the status light worked there;
  - closing the pop-out window docked the pane back in the main window, still working;
  - the layout saved the pop-outs, and reopening brought the pop-out window back;
  - a `keydown` listener on the main window did not hear keys typed in a pop-out.
- Look: the Blueprint tokens (Default, Light, Dark) feed Tailwind, shadcn/ui on Base UI, dockview's theme and the xterm.js palette. Window chrome in Overpass, pane text in Cascadia Code with ligatures, icons from Lucide.
