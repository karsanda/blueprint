# Verdict

**Decided (2026-11-21): Electron + xterm.js 6 + WebGL.** In hands-on use it was "much, much better" than the alternatives, which matches the benchmarks below. Tauri, ghostty-web and Restty are out for now.

**Decided (2026-11-21): the Blueprint look**, with Default, Light and Dark schemes, after comparing it with Riso on live terminals (`pnpm looks`). Pane text (terminals, diff, paths) uses Cascadia Code; the window chrome uses Overpass. Riso is out.

Machine: Ubuntu 26.04, Wayland, AMD Radeon RX 9070 XT. Electron 45.4.1 (Chromium 156). Tauri 2.12.7 (WebKitGTK 2.52.6).

## Automated checks (`pnpm selftest`, `pnpm selftest:tauri`, 2026-11-21)

| Check | Electron | Tauri |
|---|---|---|
| Shell runs in a PTY, output reaches xterm.js + WebGL | pass | pass |
| Same with ghostty-web | pass | pass |
| Same with Restty | pass | pass (WebGL2 only: no WebGPU in WebKitGTK) |
| Git snapshot with a temporary index sees a file edit and shows its diff | pass | pass |
| Hook command (curl) reaches the app's hook listener | pass | pass |
| GPU in use | yes: ANGLE on the Radeon RX 9070 XT | can't tell: WebKit reports "Apple GPU" to hide the real GPU |

## Benchmark: 6.5 MB of colored, wide-character output written straight into the engine

| Engine | Electron: speed / worst frame | Tauri: speed / worst frame |
|---|---|---|
| xterm.js 6 + WebGL | **14 MB/s / 18 ms** (no frames over 50 ms) | 8.6 MB/s / 94 ms (2 frames over 50 ms) |
| ghostty-web 0.4 (canvas) | 10.8 MB/s / 12 ms | 4.2 MB/s / 19 ms |
| Restty 0.3 | 58 MB/s / 67 ms (WebGPU) | 3.3 MB/s / 119 ms (WebGL2) |

Every engine is faster in Electron: about 1.6× for xterm.js, 2.6× for ghostty-web, and much more for Restty, whose advantage depends on WebGPU. Tauri's worst frames are also longer for the GPU engines. Re-run in the interactive window, since results vary.

| Size and memory | Electron | Tauri |
|---|---|---|
| Runtime on disk | 274 MB (Electron's own files) | 13 MB (the whole app binary) |
| App processes' memory after the self-test | about 1,050 MB in 9 processes | about 890 MB in 6 processes |

Both memory numbers come right after creating three engines' terminals in a row with 6.5 MB of scrollback each. Compare idle numbers from normal use before deciding anything on memory.

## Still to decide by hand

- [ ] Claude's screen looks right and feels smooth in: xterm.js / ghostty-web / Restty
- [ ] Paste, selection, resizing and scrollback work in each
- [ ] Your own hooks still run inside the embedded Claude (`--settings` merges)
- [ ] Hook events arrive for a real Claude turn, and changes are attributed to the right pane
- [x] Tauri: builds (40 s release build) and all automated checks pass
- [ ] Tauri: the WebKitGTK rendering feels acceptable with a real Claude session
- [ ] Idle memory: Electron ___ MB vs Tauri ___ MB

## Findings so far

- Ubuntu's AppArmor blocks Chromium's sandbox for unpackaged Electron. Use `--no-sandbox` in development and ship an AppArmor profile in the package.
- Restty fetches fonts from a CDN by default. The real app must bundle them.
- Restty's `write()` calls back immediately, and while its runtime is still starting it only queues the input. (The first self-test run reported 12 ms for 6.5 MB this way.) Its callback isn't a reliable flow-control signal; the real app would need its own backpressure.
