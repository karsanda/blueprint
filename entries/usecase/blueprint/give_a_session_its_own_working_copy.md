---
type: Usecase
title: Give a session its own working copy
labels: [claude]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code, Git
Extend: Run several Claude sessions
status: draft
---

The Developer lets a Claude session work in its own working copy. Its work reaches the Folder only when the Developer takes it.

Sessions that share the Folder step on each other and on the Developer. Their Changes mix, and System cannot always tell whose they are. A session in its own working copy changes only that copy.

### Precondition

The Folder is under Git.

## Basic Flow

1. Developer starts a Claude session in a working copy of its own.
2. System starts the session in a new working copy, on a new branch from the Folder's last commit.
3. System opens the session in a new tab, marked with its branch.
4. Developer gives the session its task. Claude Code changes files in the working copy only.
5. System lists the session's Changes from its working copy, apart from the Folder's.
6. Developer reviews them, as in [Review what Claude changed](review_what_claude_changed.md).
7. Developer takes the session's work into the Folder.
8. Git brings the work into the Folder uncommitted, so the Developer commits it in their own words.
9. Developer closes the session. System removes its working copy and its branch.

## Alternative Flow 1: The Folder is not under Git

At step 1, System offers no working copy and says it needs Git. The session works in the Folder.

## Alternative Flow 2: Run commands in the working copy

At any step after step 3, Developer opens a shell in the session's working copy. It works as in [Run commands in a shell pane](run_commands_in_a_shell_pane.md).

## Alternative Flow 3: The work conflicts with the Folder

At step 8, Git cannot bring the work in cleanly. System leaves the Folder unchanged and names the files in conflict. Developer can ask the session to catch up with the Folder, then take the work again.

## Alternative Flow 4: Discard the work

At step 7, Developer discards the work instead. System asks to confirm. Then it removes the working copy and its branch, and closes the session.

## Alternative Flow 5: Close before taking the work

At step 9, the work is not in the Folder yet. System asks whether to keep or discard the working copy. A kept working copy and its branch stay for the Developer.

## Alternative Flow 6: Resume after reopening

At step 3, the session was open when Blueprint closed. System resumes it in the same working copy, as in [Talk to Claude in a pane](talk_to_claude_in_a_pane.md).

## Alternative Flow 7: The working copy is gone

At step 3, after a reopen, the working copy was removed outside Blueprint. System starts no session there and says the copy is gone.

## Slice 1: A session in its own working copy

Covers: Basic Flow steps 1 to 6, Alternative Flow 1, Alternative Flow 2, Alternative Flow 5.

The Developer can take the work by hand with Git in a shell.

Work items:

- [ ] Start a Claude session in a new working copy, on a branch of its own
- [ ] Mark the session's tab with its branch
- [ ] List the session's Changes from its working copy
- [ ] Open a shell in a session's working copy
- [ ] Ask to keep or discard the working copy when its session closes
- [ ] Offer no working copy when the Folder is not under Git

Test cases:

- Given a Folder under Git, when the Developer starts a session in a working copy, then its tab shows the new branch.
- Given a session in its own working copy, when Claude Code edits a file, then the Folder stays unchanged.
- Given a session in its own working copy, when Claude Code edits a file, then that session's Changes list it.
- Given a session in a working copy, when the Developer opens a shell for it, then the shell starts there.
- Given work not yet taken, when the Developer closes its session, then System asks to keep or discard the copy.
- Given a Folder not under Git, when the Developer starts a session, then System offers no working copy.

## Slice 2: Take or discard the work

Covers: Basic Flow steps 7 to 9, Alternative Flow 3, Alternative Flow 4.

Work items:

- [ ] Take a session's work into the Folder, uncommitted
- [ ] Leave the Folder unchanged and name the files when the work conflicts
- [ ] Discard a session's work after the Developer confirms
- [ ] Remove the working copy and its branch when its session closes

Test cases:

- Given a session's work, when the Developer takes it, then the Folder shows those Changes, uncommitted.
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

## Open questions

Answer these before Slice 1 is built.

- Take the work uncommitted, or merge the session's branch with its commits? This draft takes it uncommitted.
- Is a working copy a choice when starting a session, or the default for every session after the first? This draft makes it a choice.
- Who makes the working copy: Claude Code, which can make one itself, or System through Git? The flow fits either.
- Where do working copies live: inside the Folder, beside it, or with Blueprint's own data?
- Does a working copy follow a session's new name, or keep the branch it started with? This draft keeps the branch.

## Resources

- Extends: [Run several Claude sessions](run_several_claude_sessions.md)
- Notes: [Claude sessions](../../domain/claude_sessions/notes.md), section "Working copies"
- Related: [Review what Claude changed](review_what_claude_changed.md), [Run commands in a shell pane](run_commands_in_a_shell_pane.md)
