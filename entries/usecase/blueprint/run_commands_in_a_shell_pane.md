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

At step 1, a shell is already open. Developer opens one more shell. System opens it in a new tab, named with the next number, like Shell 2. See [Arrange my panes](arrange_my_panes.md).

## Alternative Flow 4: Rename a shell

At any step, Developer renames a shell's tab, such as "dev server". The tab keeps that name after the Folder reopens.

## Alternative Flow 5: Close a shell

At any step, Developer closes a shell's tab while another shell is open. If a program still runs in it, System asks the Developer to confirm first.

## Slice 1: A shell in the window

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 2.

Work items:

- [x] Start the Developer's shell in the Folder, in the Blueprint look ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Copy and paste with the usual terminal keys ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Offer a new shell when it exits ([#1](https://github.com/karsanda/blueprint/issues/1))

Test cases:

- Given a Folder is open, when the Developer opens a shell, then it starts in that Folder.
- Given a shell, when the Developer runs a full-screen program, then it fills the tab and responds to keys.
- Given a shell, when the Developer pastes text, then the shell receives that text.
- Given a shell, when it exits, then System offers a new shell in the same tab.

## Slice 2: More than one shell

Covers: Alternative Flow 3, Alternative Flow 4, Alternative Flow 5.

Work items:

- [x] Open another shell in a new tab, and bring every shell tab back when the Folder reopens ([#13](https://github.com/karsanda/blueprint/issues/13))
- [x] Rename a shell's tab ([#13](https://github.com/karsanda/blueprint/issues/13))
- [x] Close a shell's tab, and confirm first while a program runs in it ([#13](https://github.com/karsanda/blueprint/issues/13))

Test cases:

- Given one shell is open, when the Developer opens another, then it opens in a new tab.
- Given a shell that runs a program, when the Developer closes its tab, then System asks to confirm.

## Resources

- Notes: [Workspace](../../domain/workspace/notes.md)
