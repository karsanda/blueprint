---
type: Note
title: Claude sessions
description: How Blueprint runs Claude Code and learns each session's status
---

Code-level detail for [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), [Know when Claude needs me](../../usecase/blueprint/know_when_claude_needs_me.md) and [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md). Proven in the feasibility prototype (`~/Workspace/blueprint-prototype`, see its `VERDICT.md`).

## Running Claude Code

- Each Claude session is the real `claude` CLI in a pseudo-terminal (node-pty), drawn with xterm.js and its WebGL renderer, with the ligatures add-on loaded before WebGL.
- Blueprint passes `--session-id <uuid>` so every hook event names its session, and `--settings <file>` to add its hooks.
- The environment drops the markers a running Claude Code session gives its children (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID` and more; the list is `NESTING` in `src/main/terminal/spec.ts`). So a Blueprint started from inside a Claude Code session still runs normal sessions. Claude Code's own settings, such as `CLAUDE_CODE_USE_BEDROCK`, pass through. Newer Claude Code versions add markers: a session footer saying "inherited … marker" means one is missing from the list.
- Blueprint looks for `claude` on PATH, then in `~/.local/bin` and `~/.claude/local`, because a desktop launcher often starts apps without `~/.local/bin` on PATH.
- Claude Code handles sign-in and its folder-trust question itself, inside the pane. The trust question defaults to "No, exit", which ends the session; Blueprint then offers Restart.
- Restarting a tab replaces its terminal. Only a tab's current terminal reports output and its exit, so the replaced one never shows "exited".
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
