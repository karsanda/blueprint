---
type: Usecase
title: Run several Claude sessions
labels: [claude]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code
Includes: Talk to Claude in a pane
status: draft
---

The Developer runs more than one Claude session on the Folder at once and can tell their work apart.

## Basic Flow

1. Developer starts another Claude session.
2. System opens it in a new tab, named with the next number, like Claude 2.
3. Developer gives each session its own task, as in [Talk to Claude in a pane](talk_to_claude_in_a_pane.md).
4. Each session works on its own and shows its own status.
5. System tags each Change with the session that made it.
6. Developer reviews and answers each session in turn.

## Alternative Flow 1: Two sessions change the same file

At step 5, two sessions changed the same file. System shows an overlap warning on both tabs.

## Alternative Flow 2: Rename a session

At any step, Developer renames a session's tab, such as "api retries". System uses the new name everywhere.

## Alternative Flow 3: Close a working session

At any step, Developer closes the tab of a working session. System asks the Developer to confirm first.

## Slice 1: Sessions side by side

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 3.

Work items:

- [x] Start another Claude session in a new tab ([#9](https://github.com/karsanda/blueprint/issues/9))
- [x] Tag each Change with the session that made it ([#9](https://github.com/karsanda/blueprint/issues/9))
- [x] Warn when two sessions change the same file ([#9](https://github.com/karsanda/blueprint/issues/9))
- [x] Confirm before closing a working session ([#9](https://github.com/karsanda/blueprint/issues/9))

Test cases:

- Given one session, when the Developer starts another, then it opens as Claude 2 in a new tab.
- Given two sessions, when each edits a different file, then each file is tagged with its own session.
- Given two sessions, when both edit the same file, then both tabs show an overlap warning.
- Given a working session, when the Developer closes its tab, then System asks to confirm.

## Slice 2: Session names

Covers: Alternative Flow 2.

Work items:

- [x] Rename a session's tab, and use the new name everywhere ([#9](https://github.com/karsanda/blueprint/issues/9))

Test cases:

- Given a renamed session, when it edits a file, then the Change shows the new name.

## Known gaps

- All sessions share one Folder. Separate working copies per session come after the MVP.
- While Claude Code runs a command for one session, another session's changes also count as the first session's.
- An overlap warning stays until one of the two sessions closes or restarts.

## Resources

- Notes: [Claude sessions](../../domain/claude_sessions/notes.md)
- Related: [Review what Claude changed](review_what_claude_changed.md), [Know when Claude needs me](know_when_claude_needs_me.md)
