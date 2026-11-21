---
type: Usecase
title: Run commands in a shell pane
labels: [shell]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Operating system
status: draft
---

The Developer runs commands in the Folder without leaving Blueprint.

The shell is the Developer's own, with their usual prompt, aliases and programs.

## Basic Flow

1. Developer opens a shell in a pane.
2. System starts the Developer's own shell in the Folder.
3. Developer runs commands and reads their output.
4. Developer uses full-screen programs, such as an editor or a process monitor.
5. Developer copies and pastes text between the shell and other tabs.

## Alternative Flow 1: The shell exits

At any step, the shell exits. System keeps its output and offers to start a new shell in the same tab.

## Alternative Flow 2: The pane changes size

At any step, Developer resizes the pane or the window. The shell and its programs redraw to fit.

## Alternative Flow 3: Another shell

At step 1, a shell is already open. Developer opens one more shell in a new tab. See [Arrange my panes](arrange_my_panes.md).

## Slice 1: A shell in the window

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 2.

Work items:

- [ ] Start the Developer's shell in the Folder, in the Blueprint look
- [ ] Copy and paste with the usual terminal keys
- [ ] Offer a new shell when it exits

Test cases:

- Given a Folder is open, when the Developer opens a shell, then it starts in that Folder.
- Given a shell, when the Developer runs a full-screen program, then it fills the tab and responds to keys.
- Given a shell, when the Developer pastes text, then the shell receives that text.
- Given a shell, when it exits, then System offers a new shell in the same tab.

## Slice 2: More than one shell

Covers: Alternative Flow 3.

Test cases:

- Given one shell is open, when the Developer opens another, then it opens in a new tab.

## Resources

- Notes: [Workspace](../../domain/workspace/notes.md)
