---
type: Note
title: Claude sessions
description: How Blueprint runs Claude Code and learns each session's status
---

Code-level detail for [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), [Know when Claude needs me](../../usecase/blueprint/know_when_claude_needs_me.md) and [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md). Proven in the feasibility prototype (`~/Workspace/blueprint-prototype`, see its `VERDICT.md`).

## Running Claude Code

- Each Claude session is the real `claude` CLI in a pseudo-terminal (node-pty), drawn with xterm.js and its WebGL renderer, with the ligatures add-on loaded before WebGL.
- Blueprint passes `--session-id <uuid>` so every hook event names its session, and `--settings <file>` to add its hooks. The file is one per Claude start, and the hook URL in it ends in a per-start key. That key, not `session_id`, routes hooks to the tab.
- The environment drops the markers a running Claude Code session gives its children (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID` and more; the list is `NESTING` in `src/main/terminal/spec.ts`). So a Blueprint started from inside a Claude Code session still runs normal sessions. Claude Code's own settings, such as `CLAUDE_CODE_USE_BEDROCK`, pass through. Newer Claude Code versions add markers: a session footer saying "inherited … marker" means one is missing from the list.
- Blueprint looks for `claude` on PATH, then in `~/.local/bin` and `~/.claude/local`, because a desktop launcher often starts apps without `~/.local/bin` on PATH.
- Claude Code handles sign-in and its folder-trust question itself, inside the pane. The trust question defaults to "No, exit", which ends the session; Blueprint then offers Restart.
- Restarting a tab replaces its terminal. Only a tab's current terminal reports output and its exit, so the replaced one never shows "exited".
- `TERM=xterm-256color`, `COLORTERM=truecolor`.
- Resume after reopening: `claude --resume <session-id>`.
- No Agent SDK: it needs API-key billing. The CLI uses the Developer's own sign-in.

## Several sessions

Detail for [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md).

- Each Claude tab is one Claude start, with its own `--session-id`, start key and hook settings file. Status, notifications and the review already follow the start key, so they need nothing new.
- Starting: every group that holds a Claude tab gets a `+` header action named "New Claude session". It adds a tab `claude-<n>` titled `Claude <n>` to that group, active and focused. `n` is one more than the highest number among the open Claude tabs; the first tab, `claude-1`, is titled `Claude`.
- Closing: Claude tabs get a close action (button and middle-click), except the last open Claude tab. An Idle session closes at once. A Working or Needs-you session asks first, in Blueprint's own dialog. Closing ends the program, forgets its start key, clears its status, and ends its review session. Shells, Changes and Difference still have no close action.
- Renaming: double-click a Claude tab's title to edit it in place. Enter or leaving the field keeps the new name, Escape the old one; an empty name keeps the old one. The name is the dockview panel title, so the window title, notifications, the Changes pane and the close question all read it, and the layout file saves it.
- Restored layouts accept `claude-<n>` tabs (terminal, kind `claude`). Each starts a fresh session.
- Chromium allows about 16 WebGL contexts. When it drops one, that terminal falls back to xterm's DOM renderer, which `onContextLoss` already handles.

## Learning the status

Status comes from three sources: Claude Code's hooks, the keys the Developer types, and the session's transcript. Hooks alone are not enough, because some answers and every refusal fire no hook (see below).

The generated settings file adds HTTP hooks (`"type": "http"`) for `UserPromptSubmit`, `PreToolUse` (matcher `Bash`), `PermissionRequest`, `PostToolUse` (matcher `*`), `PostToolUseFailure` (matcher `Bash`), `Notification` and `Stop`. Claude Code POSTs each event's JSON to a local listener on `127.0.0.1` with a random port, and a random token in the `Authorization` header. The timeout is 2 seconds, or 10 for `UserPromptSubmit` and `PreToolUse`: their replies wait for a snapshot (see [Review](../review/notes.md)). The listener answers `204` with no body, so the `PermissionRequest` hook never answers a prompt for the Developer. HTTP hooks need no `curl` and no shell. Blueprint writes one settings file per Claude start. Its hook URL ends in a per-start key (`/hook/<key>`), and that key, not `session_id`, routes hooks to the tab. `session_id` and `transcript_path` only choose the transcript to follow, which changes after `/clear`. The files sit in a private directory, in `$XDG_RUNTIME_DIR` when it is set. They hold the token, so only the Developer can read them, and Blueprint deletes the directory on quit.

A Claude session shows idle once its terminal runs. There is no `SessionStart` hook: Claude Code skips HTTP hooks for that event.

| Signal | Status | Other effect |
| --- | --- | --- |
| `UserPromptSubmit` | working | start following `transcript_path`; unless the prompt is Claude Code's own, take a turn snapshot before replying (see [Review](../review/notes.md)) |
| `PreToolUse` for `Bash` | none | take a snapshot before replying |
| `PermissionRequest` | Needs you | desktop notification when the window is not focused |
| `Notification`, type `permission_prompt` or `elicitation_dialog` | Needs you | backup for `PermissionRequest` |
| `Notification`, any other type | none | |
| `PostToolUse` | working, but never clears Needs you | record the paths Claude touched |
| `PostToolUseFailure` for `Bash` | none | take the snapshot after the command, like `PostToolUse` |
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
- `/clear` starts a new session id and a new transcript. `SessionEnd` fires with reason `clear`, and the next prompt's hooks carry the new id. Compaction keeps the same id.
- `SubagentStop` fires right after `Stop` for Claude Code's own background agents. It carries no status.
- Claude Code waits for the reply to a `UserPromptSubmit` or `PreToolUse` hook, up to its timeout. With the reply held 8 seconds, the first edit came 2.5 seconds after it. Past the timeout, Claude Code goes on silently.
- `UserPromptSubmit` also fires for Claude Code's own messages, with the message as `prompt`: `<task-notification>` when a background command ends, and `<agent-message from="…">` when a subagent hands back. No field tells them from a typed prompt.
- A subagent's tool hooks carry the session's `session_id`, plus `agent_id` and `agent_type`.
- `Bash` with `run_in_background` fires `PostToolUse` when the command starts, not when it ends.
- A `Bash` command that fails fires `PostToolUseFailure` instead of `PostToolUse`, with the same `tool_use_id`.
- These last four were checked with `claude -p`, on Haiku.
- The built app showed part of it again:
  - The file of a failing `Bash` command counted as Claude's, so `PostToolUseFailure` arrived.
  - A background subagent's write counted as Claude's, in a later turn.
  - The late file of a background command counted as outside Claude.
  - This turn did not reset when the background command ended.
- The Agent tool can run a subagent in the background. Its tool hooks and permission prompts then arrive after the turn that started it ended.

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
- After `/clear`, a permission prompt still showed Needs you. Refusing it reached Idle, and a finished turn showed Idle.

## Open checks

- A real desktop notification on GNOME, and clicking it to focus the session, is not yet verified by hand.
- Managed settings can block Blueprint's hooks (`allowedHttpHookUrls`, `allowManagedHooksOnly`). The sessions then never change status.
- The Developer's own `disableAllHooks` setting silences Blueprint's hooks too. The sessions then never change status.
- `elicitation_dialog` (an MCP server asking for input) is untested. It may fire `PermissionRequest` too.
- The merge check used a folder's settings, not the Developer's `~/.claude/settings.json`. Both go through the same merge, so it should hold. The real-app check used a folder's settings again.
