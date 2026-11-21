---
type: Usecase
title: Review what Claude changed
labels: [review]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Git
status: draft
---

The Developer sees which files Claude changed in a turn and how, without opening an editor.

Changes count from the moment the Developer sent the prompt. Edits the Developer made earlier stay out of the way.

## Basic Flow

1. Developer sends a prompt to a Claude session.
2. System records the state of the Folder at that moment.
3. Claude Code changes files during the turn.
4. System lists each Change since the prompt, with the session that made it.
5. Developer picks a Change.
6. System shows the difference, with Claude's changes marked as revisions.
7. Developer reads the difference and continues the conversation.

## Alternative Flow 1: This session

At step 4, Developer chooses This session. System lists every Change since the session started.

## Alternative Flow 2: Changed outside Claude

At step 4, a Change came from the Developer or a tool, such as a formatter. System marks it as changed outside Claude.

## Alternative Flow 3: The file changes again

At step 6, the file changes again. System updates the list and the difference.

## Alternative Flow 4: New, deleted or binary file

At step 6, System shows the whole new file or the whole removed file. For a binary file, System says it is binary.

## Alternative Flow 5: The Folder is not under Git

At step 2, Git cannot record the Folder. System explains that review needs Git.

## Slice 1: This turn

Covers: Basic Flow, Alternative Flow 2, Alternative Flow 3, Alternative Flow 4, Alternative Flow 5.

Work items:

- [ ] Record the Folder's state on each prompt
- [ ] List each Change since the prompt, with who made it
- [ ] Show the difference with revision clouds on Claude's changes
- [ ] Refresh the list and the difference when files change

Test cases:

- Given the Developer sent a prompt, when Claude edits two files, then the list shows exactly those two files.
- Given the Developer edited a file before the prompt, when Claude edits another file, then only Claude's file is listed.
- Given a formatter changes a file mid-turn, when the Developer views the list, then it shows as changed outside Claude.
- Given a listed file, when the Developer picks it, then the difference shows its added and removed lines.
- Given the Folder is not under Git, when the Developer opens the review, then System explains that review needs Git.

## Slice 2: This session

Covers: Alternative Flow 1.

Work items:

- [ ] Switch the list between This turn and This session

Test cases:

- Given two prompts in one session, when the Developer chooses This session, then Changes from both turns are listed.

## Known gaps

- Claude Code can leave a command running in the background. Files it changes later show as changed outside Claude.
- A file the Developer edits while Claude Code runs a command counts as Claude's.
- A file that both Claude Code and the Developer changed shows as Claude's.

## Terms

- Revision cloud: the scalloped outline drawn around Claude's changes in a difference, as on a revised technical drawing.

## Resources

- Notes: [Review](../../domain/review/notes.md)
- Related: [Run several Claude sessions](run_several_claude_sessions.md)
