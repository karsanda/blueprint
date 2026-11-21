# Blueprint prototype (THROWAWAY)

This is **not the app**. It's a throwaway feasibility prototype that answers four questions before anything real gets built:

1. Does the real `claude` CLI run well inside an embedded terminal on this machine (Linux, Wayland)?
2. Which terminal engine feels best: **xterm.js 6 + WebGL**, **ghostty-web** (libghostty WASM, canvas), or **Restty** (libghostty WASM, WebGPU/WebGL2)?
3. Which shell: **Electron** (Chromium) or **Tauri 2** (WebKitGTK)? The same frontend (`src/`) runs in both.
4. Do Claude Code hooks injected with `--settings` reach the app, and can per-turn git snapshots show exactly what a turn changed?

Results so far: [VERDICT.md](VERDICT.md).

## Run it

```sh
pnpm install            # once
pnpm sandbox            # creates .sandbox/demo-repo, a tiny git repo for Claude to edit
pnpm proto              # Electron
pnpm proto:tauri        # Tauri (needs the system packages below; first build takes a few minutes)
```

To point it at another repo: `BLUEPRINT_REPO=~/Workspace/some-repo pnpm proto`. Snapshots only add objects to that repo's `.git`; your staging area and files aren't touched.

Self-tests (open a window for about 20 seconds, then print results):

```sh
pnpm selftest           # Electron
pnpm selftest:tauri     # Tauri
```

Tauri needs these Ubuntu packages once:

```sh
sudo apt install -y pkg-config libwebkit2gtk-4.1-dev librsvg2-dev libxdo-dev libayatana-appindicator3-dev
```

## What to try

The window has two panes, each with an engine picker (xterm.js WebGL, xterm.js DOM, ghostty-web, Restty) and a program picker (claude or shell). The right column shows benchmark results, hook events, and changes since the last prompt.

1. **Talk to Claude in both panes.** Ask: "fix the bug in average and add a test for empty lists". Watch:
   - the spinner, colors, and box drawing;
   - typing latency;
   - paste with Ctrl+Shift+V;
   - selecting text with the mouse;
   - resizing the window;
   - scrolling back through history.
2. **Switch engines** with the dropdown and repeat. The same Claude conversation doesn't carry over; each restart is a new session.
3. **Hooks:** the Hook events list should show SessionStart, UserPromptSubmit, PostToolUse with the file path, Notification when Claude asks permission, and Stop. Also check that **your own hooks still run** inside the embedded Claude (for example the superpowers message at session start). That confirms `--settings` adds to your settings instead of replacing them.
4. **Changes:** choose the pane and "This turn". After Claude edits, the files appear marked "Claude A" or "Claude B". Click one to see its diff. Change a file from a shell pane (`echo x >> README.md`); it should appear marked "other".
5. **Benchmark** each engine in both shells. The table records the speed and the worst frame.
6. **Shell mode:** try `vim`, `htop`, `git log`.
7. **Memory:** note the number in the top bar after things settle. It counts the app's own processes and excludes claude and the shells.

## Looks prototype: Blueprint vs Riso

```sh
pnpm looks              # real workspace in Electron + xterm.js WebGL, styled per variant
pnpm looks:shots        # saves one screenshot per variant to .shots/ (uses its own throwaway repo)
```

A floating bar at the bottom cycles six variants: Blueprint Default/Light/Dark and Riso Light/Dark/Custom paper. Use its arrows, or ← → when no terminal has focus. Riso Custom shows a paper color picker. The variant is also in the address, `looks.html?variant=riso-dark`.

Everything on screen is live: Claude runs in the center pane, zsh at the bottom, and hook events fill the activity list, statuses and the changes list. Things to try:

1. Ask Claude to change something in the demo repo. Watch the changes list and the diff: revision clouds and delta tags in Blueprint, ink overprint in Riso.
2. When Claude asks permission, the tab dot, the pane status and the title bar should all switch to "needs you".
3. Press **+** in the Claude pane for a second Claude session in a new tab.
4. Flip through all six variants with a real session on screen. Light schemes are where Claude's own colors can clash, so run `/theme` inside Claude and pick an ANSI-colors variant: Claude then uses the terminal's palette, which follows the look.

## Notes

- Electron runs with `--no-sandbox` here. Ubuntu's AppArmor blocks Chromium's sandbox for apps run straight from `node_modules`; a packaged app ships an AppArmor profile instead. That's fine for a local prototype that only loads local files.
- Restty downloads its fonts from the jsDelivr CDN at startup. The real app would bundle fonts.
- No tests, no error handling, no polish. Delete this folder once the verdict is written.
