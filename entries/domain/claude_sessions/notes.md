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

Status comes from three sources: Claude Code's hooks, the keys the Developer types, and the session's transcript. Hooks alone are not enough, because some answers and every refusal fire no hook (see below).

The generated settings file adds HTTP hooks (`"type": "http"`) for `UserPromptSubmit`, `PermissionRequest`, `PostToolUse` (matcher `*`), `Notification` and `Stop`. Claude Code POSTs each event's JSON to a local listener on `127.0.0.1` with a random port, and a random token in the `Authorization` header. The timeout is 2 seconds. The listener answers `204` with no body, so the `PermissionRequest` hook never answers a prompt for the Developer. HTTP hooks need no `curl` and no shell. The file holds the token, so only the Developer can read it, and Blueprint deletes it on quit.

A Claude session shows idle once its terminal runs. There is no `SessionStart` hook: Claude Code skips HTTP hooks for that event.

| Signal | Status | Other effect |
| --- | --- | --- |
| `UserPromptSubmit` | working | start following `transcript_path`; take a turn snapshot (see [Review](../review/notes.md)) |
| `PermissionRequest` | Needs you | desktop notification when the window is not focused |
| `Notification`, type `permission_prompt` or `elicitation_dialog` | Needs you | backup for `PermissionRequest` |
| `Notification`, any other type | none | |
| `PostToolUse` | working, but never clears Needs you | attribute `tool_input.file_path` to the session |
| `Stop` | idle | refresh the review |
| The Developer types a key in a pane that shows Needs you | working | |
| The transcript gains a line starting `[Request interrupted by user` | idle | |

### What Claude Code 2.1.330 sends

Checked on 2026-11-21 with a real session whose hooks logged every event:

- `--settings` hooks add to the Developer's own hooks. A folder's `.claude/settings.json` hooks still fired beside them.
- No hook fires before the Developer accepts the folder-trust question.
- HTTP hooks work, and a header value reaches the listener as written. Claude Code skips HTTP hooks for `SessionStart` and `Setup`.
- When the listener is gone, Claude Code finishes its turn as usual, with no error.
- `PermissionRequest` fires the moment a prompt appears, both for a tool permission and for an `AskUserQuestion` question. In auto mode it does not fire for actions the classifier approves.
- `Notification` with type `permission_prompt` follows about 10 seconds later, and only if the prompt is still open.
- `Notification` with type `idle_prompt` fires about 60 seconds after a turn ends. It must not mark Needs you.
- Approving a prompt fires nothing. The next hook is `PostToolUse`, once the tool finishes, which can be minutes later. Hence the typing rule.
- Refusing a prompt (Esc or "No") and pressing Esc mid-turn end the turn with no hook at all: no `Stop`, no `PermissionDenied`, and no later `idle_prompt`. The transcript is the only trace. It gains a user entry `[Request interrupted by user for tool use]` or `[Request interrupted by user]`.
- `SubagentStop` fires right after `Stop` for Claude Code's own background agents. It carries no status.

### Rules

- Only keys the Developer types count. Focus and mouse reports that the terminal sends on its own do not, or clicking a pane would clear Needs you.
- `PostToolUse` never clears Needs you. A parallel tool can finish while a prompt for another tool is still open.
- The transcript format is not documented. Blueprint relies only on the interrupt text, and only on lines added after it starts following the file. The interrupt is a `user` entry whose content is a list of text parts. A prompt is stored as plain text, so a prompt with the same words does not count.

- The file watcher takes its own first reading a moment after following starts. So the follower does one catch-up read after one poll interval. Without it, growth in that gap is never reported.

### Checked in the real app

Checked on 2026-11-21 with the built app, Claude Code 2.1.330 in manual mode, and the window treated as not in front:

- A permission prompt showed Needs you on the tab, the pane and the title bar. The prompt stayed open, so the hook did not answer it.
- The app recorded one notification, with the intended copy, for each change to Needs you.
- Approving with Enter showed Working at once, through the typing rule. Idle followed when the turn ended.
- Refusing with Esc reached Idle in about 0.2 seconds, through the transcript. Esc mid-turn took about 0.3 seconds.
- An `AskUserQuestion` question showed Needs you, and answering it showed Working, then Idle.
- The session stayed Idle for 75 seconds after a turn, so `idle_prompt` is ignored.
- The folder's own hooks still ran beside Blueprint's.

## Open checks

- A real desktop notification on GNOME, and clicking it to focus the session, is not yet verified by hand.
- Managed settings can block Blueprint's hooks (`allowedHttpHookUrls`, `allowManagedHooksOnly`). The sessions then never change status.
- `elicitation_dialog` (an MCP server asking for input) is untested. It may fire `PermissionRequest` too.
- The merge check used a folder's settings, not the Developer's `~/.claude/settings.json`. Both go through the same merge, so it should hold. The real-app check used a folder's settings again.
