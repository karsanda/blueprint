---
type: Usecase
title: Give a session its own working copy
labels: [claude]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code, Git
Extend: Run several Claude sessions
status: retired
---

The Developer runs a second Claude session without its changes mixing with the first session's. Its work reaches the Folder only when the Developer takes it.

The Developer usually runs one session, sometimes two. When two share the Folder, their Changes mix, and the Developer cannot tell them apart or undo one alone. So the first session works in the Folder, as before. Every further session gets a working copy of its own.

### Retired

Retired on 2026-11-22, before it was built. The Developer rarely runs two sessions at once, and the build is large. For that rare case, the Developer has Git make a second working copy and opens Blueprint on it. That window is a Folder of its own, with its own sessions and review. The flows and decisions below stay, in case parallel sessions become common.

### Precondition

The Folder is under Git, and a Claude session already runs in it.

## Basic Flow

1. Developer starts another Claude session.
2. System makes a working copy of the Folder as it is now, uncommitted changes included, on a new branch.
3. System copies in the files on the copy list, which Git does not track.
4. System opens the session in a new tab, marked with its branch.
5. Developer gives the session its task. Claude Code changes files in the working copy only.
6. System lists the session's own Changes, and Developer reviews them, as in [Review what Claude changed](review_what_claude_changed.md).
7. Developer takes the session's work into the Folder.
8. Git brings only the session's own changes into the Folder, uncommitted. Developer commits them in their own words.
9. Developer closes the session. System removes its working copy and its branch.

## Alternative Flow 1: The Folder is not under Git

At step 2, System makes no working copy and says why. The session works in the Folder, as before.

## Alternative Flow 2: Run commands in the working copy

At any step after step 4, Developer opens a shell in the session's working copy. It works as in [Run commands in a shell pane](run_commands_in_a_shell_pane.md).

## Alternative Flow 3: The work conflicts with the Folder

At step 8, the session and the Folder changed the same lines since the copy started. System leaves the Folder unchanged and names the files. Developer has System catch the copy up. System brings the Folder's newer changes into the copy and marks the clashes there. The session resolves them, then Developer takes the work again.

## Alternative Flow 4: Discard the work

At step 7, Developer discards the work instead. System asks to confirm. Then it removes the working copy and its branch, and closes the session.

## Alternative Flow 5: Close before taking the work

At step 9, the work is not in the Folder yet. System asks whether to keep or discard the working copy. A kept working copy and its branch stay for the Developer.

## Alternative Flow 6: Resume after reopening

At step 4, the session was open when Blueprint closed. System resumes it in the same working copy, as in [Talk to Claude in a pane](talk_to_claude_in_a_pane.md).

## Alternative Flow 7: The working copy is gone

At step 4, after a reopen, the working copy was removed outside Blueprint. System starts no session there and says the copy is gone.

## Slice 1: A second session in its own working copy

Covers: Basic Flow steps 1 to 6, Alternative Flow 1, Alternative Flow 2, Alternative Flow 5.

The Developer can take the work by hand with Git in the copy's shell.

Work items:

- [ ] Give each session after the first a working copy of the Folder as it is now
- [ ] Copy in the files on the copy list
- [ ] Mark the session's tab with its branch
- [ ] List the session's own Changes from its working copy
- [ ] Open a shell in a session's working copy
- [ ] Ask to keep or discard the working copy when its session closes
- [ ] Make no working copy when the Folder is not under Git

Test cases:

- Given one running session, when the Developer starts another, then it works in a new working copy and branch.
- Given uncommitted changes in the Folder, when a working copy is made, then the copy holds them too.
- Given a file on the copy list, when a working copy is made, then the copy holds it.
- Given a session in a working copy, when Claude Code edits a file, then the Folder stays unchanged.
- Given work not yet taken, when the Developer closes its session, then System asks to keep or discard the copy.
- Given a Folder not under Git, when the Developer starts another session, then it works in the Folder.

## Slice 2: Take or discard the work

Covers: Basic Flow steps 7 to 9, Alternative Flow 3, Alternative Flow 4.

Work items:

- [ ] Take a session's own changes into the Folder, uncommitted
- [ ] Leave the Folder unchanged and name the files when the work conflicts
- [ ] Discard a session's work after the Developer confirms
- [ ] Remove the working copy and its branch when its session closes

Test cases:

- Given a session's work, when the Developer takes it, then the Folder shows only that session's changes, uncommitted.
- Given work that conflicts with the Folder, when the Developer takes it, then System names the files and changes nothing.
- Given a session's work, when the Developer discards it and confirms, then its working copy and branch are gone.
- Given taken work, when the Developer closes the session, then its working copy and branch are gone.

## Slice 3: Reopen

Covers: Alternative Flow 6, Alternative Flow 7.

Work items:

- [ ] Resume a session in its working copy after reopening
- [ ] Say so when a session's working copy was removed outside Blueprint

Test cases:

- Given a session in its own working copy, when the Developer reopens the Folder, then it resumes in that copy.
- Given a working copy removed outside Blueprint, when the Folder reopens, then System says the copy is gone.

## Decisions

Made with the Developer on 2026-11-22.

- The first session works in the Folder. Only further sessions get a working copy, made without asking.
- A working copy starts from the Folder as it is, uncommitted changes included. Taking it brings back only the session's own changes.
- Taken work arrives uncommitted, as Claude's changes always do. Commits made in the copy come in as plain changes.
- System makes each working copy itself, through Git, and keeps it outside the Folder. So copies never show as Changes there.
- A branch keeps the name it started with, even when the Developer renames the tab.
- The copy list starts empty. The Developer adds the untracked files each copy needs, such as settings with secrets.
- A clash means the same lines, not just the same file. The Developer's own edits in the Folder count too.
- A clash is resolved in the copy, through catch up, so the Folder only ever receives clean work.
- After a take or a catch up, the copy's starting point moves forward. A later take brings only newer work.
- A new session works in the Folder whenever no open session works there.
- Claude Code itself asks before writing outside the copy, so System adds no guard. Shell commands cannot be guarded.

## Terms

- Copy list: the files Git does not track that System copies into each new working copy. The Developer keeps it in the Folder.

## Resources

- Extends: [Run several Claude sessions](run_several_claude_sessions.md)
- Notes: [Claude sessions](../../domain/claude_sessions/notes.md), section "Working copies"
- Related: [Review what Claude changed](review_what_claude_changed.md), [Run commands in a shell pane](run_commands_in_a_shell_pane.md)
