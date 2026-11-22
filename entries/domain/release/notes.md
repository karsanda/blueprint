---
type: Note
title: Release
description: How Blueprint is packaged for Ubuntu and macOS, how a release is made, and what Blueprint needs to run on macOS
---

Code-level detail for releasing Blueprint, and for running it on macOS. The use cases stay platform-neutral: "the usual terminal keys" are Ctrl+Shift+C and V on Ubuntu, and Cmd+C and Cmd+V on macOS. Differences in keys and mechanism live here.

The first release is `v0.1.0`, the MVP, for the Developer's own Ubuntu and macOS machines.

## Packages

- electron-builder packages the app electron-vite builds into `out/`.
  - Name `Blueprint`, app id `io.github.karsanda.blueprint`.
  - The version comes from `package.json`, and the release tag is `v` and that version.
- Ubuntu: a `.deb` for amd64.
  - It installs the app with a `blueprint` command on the `PATH` and a desktop-menu entry with the icon.
  - The menu entry opens the folder picker.
  - `apt remove blueprint` uninstalls it.
- macOS: a `.dmg` for Apple Silicon (arm64).
  - It is not signed with a Developer ID or notarized, so Gatekeeper blocks the first open. The Developer allows it once, in System Settings › Privacy & Security, or with `xattr -dr com.apple.quarantine /Applications/Blueprint.app`.
  - An arm64 app must carry at least an ad-hoc signature to launch at all; the build gives it one.
  - Opened from the Dock, Launchpad or Spotlight, it shows the folder picker.

## The `blueprint` command

- `blueprint <folder>` opens that Folder in a new Blueprint and gives the prompt back at once, as `code .` does. `blueprint` with no folder opens the folder picker.
- The packaged app detaches itself when started from a terminal (its standard input is a terminal):
  - it starts itself again in its own session (`detached`, so its own process group and session), with the folder turned into an absolute path and its output discarded;
  - then the first process exits, which gives the prompt back;
  - closing the terminal then ends neither Blueprint nor its Claude sessions.

  A marker in the environment keeps the second start from detaching again. Unpackaged runs (`pnpm dev`, e2e) never detach.
- Ubuntu: the `.deb`'s standard `/usr/bin/blueprint` link to the app is the command.
- macOS: a `.dmg` cannot put a command on the `PATH`, and a link straight to the binary inside `Blueprint.app` stops it finding its own bundle.
  - So the app carries a two-line script at `Blueprint.app/Contents/Resources/bin/blueprint`, which runs `Blueprint.app/Contents/MacOS/Blueprint` with its arguments.
  - The Developer links the script once, for example `ln -s /Applications/Blueprint.app/Contents/Resources/bin/blueprint ~/.local/bin/blueprint`.
  - Each Folder opens in its own Blueprint, with its own icon in the Dock.
- There is no Open item in a menu: opening another Folder from an open window is [#32](https://github.com/karsanda/blueprint/issues/32).

- A packaged app keeps its settings and layouts in its own user data: `~/.config/Blueprint` on Ubuntu, `~/Library/Application Support/Blueprint` on macOS.
- Dev runs never share it. `pnpm dev` uses `~/.config/blueprint`, and e2e and hands-on runs, which launch `out/main/index.js` directly, use `~/.config/Electron`. macOS ignores letter case in paths, so there `blueprint` and `Blueprint` would be one folder: an unpackaged run therefore keeps its user data in a folder of its own name.
- Icon: one 1024 × 1024 PNG in Blueprint's look, a blueprint-blue square with light line work. electron-builder makes the macOS icon from it. The Developer may replace it later.

## Making a release

- A workflow, `.github/workflows/release.yml`, runs when a tag `v*` is pushed:
  - it fails at once when the tag is not `v` and `package.json`'s version;
  - an Ubuntu job builds the `.deb`, and a macOS job (an Apple Silicon runner) builds the `.dmg`;
  - a last job creates a **draft** GitHub release named after the tag, attaches both files, and takes its text from `doc/releases/<tag>.md`.
- Nobody but the Developer sees a draft. The Developer reads it, and publishes it.
- Before the tag goes on, `main` passes CI on both platforms.

## Running on macOS

### Menu and keys

- Ubuntu keeps no app menu: Electron's default one would take Ctrl+W, Ctrl+R and Ctrl+V from the terminals (see [Workspace](../workspace/notes.md)).
- macOS gets a small standard menu instead. Without one, Cmd+C, Cmd+V and Cmd+Q do nothing there.
  - **Blueprint:** About Blueprint, Hide Blueprint (Cmd+H), Hide Others, Show All, Quit Blueprint (Cmd+Q).
  - **Edit:** Undo, Redo, Cut, Copy, Paste, Select All, through Electron's menu roles.
  - **Window:** Minimize (Cmd+M), Zoom, Bring All to Front.

  There is no View menu (no reload, no developer tools) and no Close Window item.
- In a terminal, Cmd+C copies the selection and Cmd+V pastes: the Edit roles send copy and paste events, which xterm handles as it does Ctrl+Shift+C and V. Ctrl+Shift+C and V keep working on macOS too. Chromium pastes on Ctrl+Shift+V only on Linux, so on macOS Blueprint reads the clipboard and pastes it into the terminal itself, once.
- The workspace keys stay Ctrl+Shift on macOS, as on Ubuntu. Cmd combinations belong to macOS and to the menu.
- Option acts as Alt in terminals on macOS (xterm's `macOptionIsMeta`), so the shell's Alt bindings, such as fzf's Alt+C, work as on Ubuntu. Option then types no special characters in a terminal. Ctrl+Shift+Option+H/J/K/L move a tab either way, because Blueprint reads those keys before xterm does.
- Cmd+Q quits like closing the window: the layout and the window's bounds are saved. Closing the window quits Blueprint on macOS too: it is one window on one Folder.

### Environment, on both platforms

- An app the desktop starts gets a shorter environment than a terminal:
  - on macOS, from Finder, the Dock or `open`, launchd's environment, whose `PATH` lacks Homebrew, npm and the Developer's own folders;
  - on Ubuntu, from the desktop menu, the login profile's environment (`~/.profile`), without what `~/.zshrc` sets up (nvm, mise and the like).

  `claude`, and the tools, MCP servers and hooks Claude Code starts, take Blueprint's environment, so they would go missing.
- When Blueprint was not started from a terminal (no `TERM` in its environment), it runs the Developer's login shell once at startup, before starting any program.
  - The run is interactive (`$SHELL -i -l -c`), and Blueprint reads the environment it prints between two markers.
  - Blueprint takes that shell's `PATH`, and every other variable its own environment lacks.
  - The run gets 5 seconds. If it fails or runs out of time, Blueprint goes on with the environment it has.
- Started from a terminal, as the `blueprint` command is, the environment is already full, and Blueprint skips the run.
- On macOS, shells start as login shells (`-l`), as Terminal.app starts them, so `~/.zprofile` runs (Homebrew puts its `PATH` there). Ubuntu keeps today's shells.

### A busy shell

- The busy-shell check (see [Workspace](../workspace/notes.md), "Several shells") reads `/proc` on Linux. macOS has no `/proc`, so it lists processes once with `ps -A -o pid=,pgid=,tpgid=,comm=`, with a 2-second limit.
  - The shell's own row gives the terminal's foreground group (`tpgid`). There is none when that is the shell's pid, or 0 or less.
  - Otherwise the program is the lowest-numbered process in that group (`pgid` equal to `tpgid`), named by the last part of its `comm`. This also covers a pipeline whose first command has ended.
  - A `ps` that fails or runs out of time gives none.
- The check answers asynchronously on both platforms; the renderer already awaits it.

### Tests

- CI runs the checks and the end-to-end suite on macOS too (`macos-latest`, Apple Silicon), beside Ubuntu.
- The e2e harness passes Chromium's headless-display flags only on Linux; on the macOS runner the windows show on its screen.
- A test that only makes sense on Linux, such as the Wayland branch, is skipped on macOS with its reason. Any other macOS failure gets a fix.

### To check by hand on the Developer's Mac

These were not checked: there is no Mac here, and CI cannot do them.

- The first open after Gatekeeper.
- A desktop notification, and a click on it.
- Real Claude Code started from a Finder-opened Blueprint, finding its tools.
