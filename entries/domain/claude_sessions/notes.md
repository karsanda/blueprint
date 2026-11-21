---
type: Note
title: Claude sessions
description: How Blueprint runs Claude Code and learns each session's status
---

Code-level detail for [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), [Know when Claude needs me](../../usecase/blueprint/know_when_claude_needs_me.md) and [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md). Proven in the feasibility prototype (`~/Workspace/blueprint-prototype`, see its `VERDICT.md`).

## Running Claude Code

- Each Claude session is the real `claude` CLI in a pseudo-terminal (node-pty), drawn with xterm.js and its WebGL renderer, with the ligatures add-on loaded before WebGL.
- Blueprint passes `--session-id <uuid>` so every hook event names its session, and `--settings <file>` to add its hooks.
- The environment drops `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT`, so a session started from inside another Claude Code session still runs normally.
- `TERM=xterm-256color`, `COLORTERM=truecolor`.
- Resume after reopening: `claude --resume <session-id>`.
- No Agent SDK: it needs API-key billing. The CLI uses the Developer's own sign-in.

## Learning the status

The generated settings file adds hooks for `SessionStart`, `UserPromptSubmit`, `PostToolUse` (matcher `*`), `Notification`, `Stop` and `SubagentStop`. Each hook runs `curl` to POST its JSON to a local listener on `127.0.0.1` with a random port and token. It times out after 2 seconds and always exits 0, so it never blocks Claude Code.

| Hook event | Status | Other effect |
| --- | --- | --- |
| SessionStart | idle | |
| UserPromptSubmit | working | take a turn snapshot (see [Review](../review/notes.md)) |
| PostToolUse | working | attribute `tool_input.file_path` to the session |
| Notification | Needs you | desktop notification when the window is not focused |
| Stop | idle | refresh the review |

## Open checks

- Confirm that `--settings` hooks add to the Developer's own hooks instead of replacing them. Fallback: deliver the hooks as a plugin with `--plugin-dir`.
