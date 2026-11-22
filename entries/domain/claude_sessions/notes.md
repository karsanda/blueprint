---
type: Note
title: Claude sessions
description: How Blueprint runs Claude Code and learns each session's status
---

Code-level detail for [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), [Know when Claude needs me](../../usecase/blueprint/know_when_claude_needs_me.md) and [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md). Proven in the feasibility prototype (`~/Workspace/blueprint-prototype`, see its `VERDICT.md`).

## Running Claude Code

- Each Claude session is the real `claude` CLI in a pseudo-terminal (node-pty), drawn with xterm.js and its WebGL renderer, with the ligatures add-on loaded before WebGL.
- Blueprint passes `--session-id <uuid>` for a new conversation (and `--resume <sessionId>` instead for a resumed one) so every hook event names its session, and `--settings <file>` to add its hooks. The file is one per Claude start, and the hook URL in it ends in a per-start key. That key, not `session_id`, routes hooks to the tab.
- The environment drops the markers a running Claude Code session gives its children (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID` and more; the list is `NESTING` in `src/main/terminal/spec.ts`). So a Blueprint started from inside a Claude Code session still runs normal sessions. Claude Code's own settings, such as `CLAUDE_CODE_USE_BEDROCK`, pass through. Newer Claude Code versions add markers: a session footer saying "inherited … marker" means one is missing from the list.
- Blueprint looks for `claude` on PATH, then in `~/.local/bin` and `~/.claude/local`, because a desktop launcher often starts apps without `~/.local/bin` on PATH. On macOS, Blueprint first takes the login shell's environment, because an app opened from Finder starts with a short one (see [Release](../release/notes.md)).
- Claude Code handles sign-in and its folder-trust question itself, inside the pane. The trust question defaults to "No, exit", which ends the session; Blueprint then offers Restart.
- Restarting a tab replaces its terminal. Only a tab's current terminal reports output and its exit, so the replaced one never shows "exited".
- `TERM=xterm-256color`, `COLORTERM=truecolor`.
- Resume after reopening: see the section below.
- No Agent SDK: it needs API-key billing. The CLI uses the Developer's own sign-in.

## Several sessions

Detail for [Run several Claude sessions](../../usecase/blueprint/run_several_claude_sessions.md).

- Each Claude tab is one Claude start, with its own session id (`--session-id` for a new conversation, `--resume` for a resumed one), start key and hook settings file. Status, notifications and the review already follow the start key, so they need nothing new.
- Starting: every group that holds a Claude tab gets a `+` header action named "New Claude session". It adds a tab `claude-<n>` titled `Claude <n>` to that group, active and focused. `n` is one more than the highest number among the open Claude tabs and every number opened earlier in the run, so a closed session's number is never reused while Blueprint runs; the first tab, `claude-1`, is titled `Claude`.
- Closing: Claude tabs get a close action (button and middle-click), except the last open Claude tab. An Idle session closes at once. A Working or Needs-you session asks first, in Blueprint's own dialog. Closing ends the program, forgets its start key, clears its status, and ends its review session. Changes and Difference still have no close action; shells close as [Workspace](../workspace/notes.md) describes under Several shells.
- Renaming: double-click a Claude tab's title to edit it in place. Enter or leaving the field keeps the new name, Escape the old one; an empty name keeps the old one. The name is the dockview panel title, so the window title, notifications, the Changes pane and the close question all read it, and the layout file saves it.
- Restored layouts accept `claude-<n>` tabs (terminal, kind `claude`). Each resumes its own saved conversation (see Resume after reopening).
- Chromium allows about 16 WebGL contexts. When it drops one, that terminal falls back to xterm's DOM renderer, which `onContextLoss` already handles.
- Launching the built `out/main/index.js` directly (as the hands-on check and the e2e harness do) makes Electron's app name "Electron", so its user data is `~/.config/Electron`, not `~/.config/blueprint`.

### Checked in the real app with several sessions

Real Claude Code 2.1.330 on Haiku, in manual mode, with two sessions in a scratch Git folder.

- Each session wrote its own file. The review tagged one file "Claude" and the other "Claude 2", and the title read "Needs you: Claude 2" while that session waited.
- Both sessions edited `notes.md`. Both tabs showed the overlap mark, each naming the other session.
- Renaming Claude to "api retries" reached the title, the Changes header and the rows, including a Change made before the rename.
- Closing Claude 2 while it worked asked first. After confirming, its tab was gone, the running `claude` processes went from 2 to 1, and both overlap marks cleared.

## Resume after reopening

Detail for [Talk to Claude in a pane](../../usecase/blueprint/talk_to_claude_in_a_pane.md), Slice 2.

- Each Claude tab saves the conversation it continues with the tab itself: the panel parameter `conversation`, holding `{ sessionId, transcript }` from Claude Code's hooks. The layout file saves it like the tab's name. So a layout Blueprint throws away takes its conversations with it, a new `+` tab never inherits one, and a closed tab's conversation goes with the tab.
- Main tells the renderer which conversation a tab continues. A start that resumes keeps the saved one; any other start clears it. The first `UserPromptSubmit` of a session id saves `{ session_id, transcript_path }`, so after `/clear` the tab saves the new conversation at its next prompt.
- A tab's first start in a run sends its saved conversation. Main resumes with `claude --resume <sessionId> --settings <file>` only when `sessionId` is a UUID and `transcript` is an absolute path to an existing `<sessionId>.jsonl`. Otherwise it starts a new conversation with `--session-id`, and the pane shows a notice that the last conversation could not be found. An id that is not a UUID never reaches Claude Code's arguments.
- Restart after Claude Code exits starts a new conversation, and so does a `+` tab. A first start that fails (for example `claude` is not found) keeps the saved conversation, so Restart after it still resumes. The new conversation is saved at its first prompt, so a tab that never got one starts fresh after reopening.
- Claude Code keeps the session id on `--resume` and redraws the conversation in the pane. `--resume` with `--session-id` fails unless `--fork-session` is given, so a resumed start passes no `--session-id`. Hooks still route by the start key.
- Shells start fresh in restored panes.
- One Blueprint per Folder ([#29](https://github.com/karsanda/blueprint/issues/29)):
  - The Blueprint that opens a Folder first holds it, through a lock file `<user data>/locks/<folderKey>.lock` holding its pid. `folderKey` is the layout file's name: the first 16 hex digits of sha256(Folder path). The file is made with `wx`, so two Blueprints opening the Folder at once cannot both take it.
  - A lock whose pid no longer runs, or that names no pid, is taken over. A pid that runs as another user counts as running.
  - A Blueprint that does not hold the Folder resumes nothing: each tab that had a conversation starts a new one, and the pane says the Folder is open in another Blueprint window. It writes no layout file and no window bounds, and keeps its review in its own run's store (see [Review](../review/notes.md)).
  - The lock goes on quit, and when the Developer picks another Folder. A lock that cannot be written at all leaves Blueprint acting as the holder, as before locks.

### Checked against Claude Code 2.1.330

On Haiku, in a scratch Folder:

- `--resume <id>` continued the conversation under the same id: it answered from an earlier prompt, and the interactive pane showed the earlier turns.
- `--resume` of an unknown id printed `No conversation found with session ID: <id>` and exited with code 1.
- `--resume <id> --session-id <other>` failed: `--session-id with --continue or --resume also needs --fork-session.`

### Checked in the real app

Built app, real Claude Code 2.1.330 on Haiku, in a scratch Git folder.

- Two sessions each got a prompt (remember ZEBRA, remember OTTER). The layout saved each tab's `{ sessionId, transcript }`, and the transcript paths were Claude Code's own `~/.claude/projects/<folder>/<id>.jsonl`.
- After reopening, each tab showed its own earlier conversation, never the other's, and each answered its own word when asked. No notice showed.
- With Claude 2's transcript deleted, reopening started a new conversation in Claude 2 with the notice, while Claude 1 still resumed. Dismiss removed the notice.

### Known gaps

- After `/clear`, the tab saves the new conversation only at its next prompt. Quitting before that resumes the conversation from before `/clear`.
- Blueprint only checks that the transcript file exists. If Claude Code still refuses the conversation, the tab shows Claude Code exited (code 1) at that reopen, and Restart starts a new conversation.

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
| `Stop` | idle, or Needs you when `last_assistant_message` ends on a question | refresh the review |
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

### Questions in plain text

Claude Code sometimes asks the Developer in plain text and ends its turn ([#16](https://github.com/karsanda/blueprint/issues/16)). No hook says it waits, but `Stop` carries `last_assistant_message`, the text of Claude's final response (Claude Code's hooks reference). When its last line ends in a question mark, past closing Markdown or quote marks such as `**`, `)` or `”`, the session shows Needs you instead of idle, with the desktop notification. A question earlier in the text, followed by a statement, does not count.

Checked with the real Claude Code 2.1.330 on 2026-11-22 (`claude -p` on Haiku): asked to reply with one question, its `Stop` carried `"last_assistant_message": "Which colour do you prefer?"`.

Not covered: the folder-trust question and the sign-in. Claude Code holds back every hook until the Developer accepts the trust question, and no hook or signal reports either one.

### An MCP server asking for input

Checked with the real Claude Code 2.1.330 on 2026-11-22 ([#17](https://github.com/karsanda/blueprint/issues/17)): interactive, in a pseudo-terminal, on Haiku, with an MCP server whose tool asks "Which colour do you prefer?" through `elicitation/create`. The tool was allowed beforehand.

- The dialog showed 4.1 s after the start. `PreToolUse` for the tool arrived at the same moment, then nothing until `Notification` with type `elicitation_dialog` and message "Claude Code needs your input", at 10.1 s. So Needs you shows about 6 seconds after the dialog. No hook arrives sooner that only a question would send.
- No `PermissionRequest` fired for the question. A tool not allowed yet asks permission first, which shows Needs you as any permission prompt does.
- Esc cancelled the dialog. `Notification` with type `elicitation_response` (`Elicitation response for server "ask": cancel`) followed, then `PostToolUse` and `Stop`. The Developer's key already moves the session off Needs you (see Rules).
- Claude Code's hooks reference lists more notification types, two of which may also mean the session waits: `elicitation_url_dialog` and `agent_needs_input`. Blueprint ignores them; to check: [#53](https://github.com/karsanda/blueprint/issues/53).

### Blocked hooks

Some of Claude Code's settings keep Blueprint's hooks from running ([#15](https://github.com/karsanda/blueprint/issues/15)). The status then never changes, and the review cannot tell Claude's Changes. When a Claude session starts, main reads the settings files and the pane names what blocks the hooks, with a Dismiss button. The rules follow Claude Code's settings reference (checked 2026-11-22):

- `allowManagedHooksOnly`, a managed-only key: any managed file setting it true blocks every hook not managed.
- `disableAllHooks`: the value of the strongest scope that sets it counts, in the order managed, `.claude/settings.local.json`, `.claude/settings.json`, then the user's `settings.json`. Within managed settings a later drop-in wins. A project's `false` overrides the user's `true`.
- `allowedHttpHookUrls`: lists from every file merge. When any file sets it, a hook runs only if its URL matches one pattern, where `*` stands for any text.
- Files: `/etc/claude-code/managed-settings.json` on Linux and `/Library/Application Support/ClaudeCode/managed-settings.json` on macOS, each followed by the `*.json` files of `managed-settings.d` beside it, in name order, hidden ones left out. The user's file is in `$CLAUDE_CONFIG_DIR`, or else `~/.claude`.
- Known gap: settings from a macOS configuration profile or from the organization's server cannot be read, so they are not checked.
- Checked with the real Claude Code 2.1.330 on 2026-11-22 (`claude -p` on Haiku, with HTTP hooks given with `--settings`, as Blueprint gives them):
  - a Folder's `.claude/settings.json` with `"disableAllHooks": true`: no hook arrived. The same run in a plain Folder got `UserPromptSubmit` and `Stop`;
  - a Folder's `.claude/settings.local.json` with `"allowedHttpHookUrls": ["https://hooks.example.com/*"]`: no hook arrived;
  - with `["http://127.0.0.1:*"]` instead: both hooks arrived. Blueprint's own reading gives the same verdicts.
  - `allowManagedHooksOnly` was not checked: it needs a managed settings file, which only an administrator writes.

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

## Working copies

Drafted, not built: detail for [Give a session its own working copy](../../usecase/blueprint/give_a_session_its_own_working_copy.md). A working copy is a Git worktree on a branch of its own.

- Two ways to make one:
  - Blueprint runs `git worktree add -b <branch> <path>` and starts `claude` with the worktree as its working directory. Blueprint then owns the path, the branch name and the removal.
  - Claude Code makes its own: 2.1.330 has `-w, --worktree [name]`, which "creates a git worktree for this session". Its place and branch name are Claude Code's, so Blueprint would have to learn them, for example from a hook's `cwd`.
- Resume: Claude Code files a transcript under the project directory it ran in (`~/.claude/projects/<folder>/<id>.jsonl`, see Resume after reopening). A resumed session must start in the same worktree.
- The review takes its snapshots of the Folder's repository today. A session in a worktree needs its own: the worktree has its own index and `HEAD`, and its Changes count from the branch's starting commit.
- Taking the work uncommitted fits `git merge --squash` without a commit, run in the Folder. It stops, and changes nothing, when the Folder's own uncommitted edits touch the same files.

## Open checks

- A real desktop notification on GNOME, and clicking it to focus the session, is not yet verified by hand.
- A notification click raising the pop-out window that holds the session ([#44](https://github.com/karsanda/blueprint/issues/44)), and two windows on one Folder with the real Claude Code (see One Blueprint per Folder), are not yet checked by hand.
- The merge check used a folder's settings, not the Developer's `~/.claude/settings.json`. Both go through the same merge, so it should hold. The real-app check used a folder's settings again.
