---
type: Usecase
title: Talk to Claude in a pane
labels: [claude]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code
status: draft
---

The Developer works with the real Claude Code inside Blueprint, on the open Folder, without a separate terminal.

Everything Claude Code offers works as usual: slash commands, plan mode, permission prompts, MCP servers and skills. Blueprint runs Claude Code with the Developer's own sign-in, so it adds no extra cost.

## Basic Flow

1. Developer opens a Folder in Blueprint.
2. System starts a Claude session for the Folder in a pane.
3. Developer types a prompt in the pane.
4. Claude Code works on the Folder and replies in the pane.
5. Developer answers Claude Code's questions and permission prompts in the pane.
6. Developer continues the conversation until the task is done.

## Alternative Flow 1: Claude Code is missing or signed out

At step 2, System cannot start Claude Code. System shows the reason and how to fix it. Developer fixes it and restarts the session.

## Alternative Flow 2: The session ends

At any step, Claude Code exits. System keeps the conversation on screen and offers to restart the session.

## Alternative Flow 3: Resume after reopening

At step 2, the Folder had a Claude session when Blueprint closed. System resumes that conversation instead of starting a new one. If System cannot find that conversation, System starts a new one and says so. If another Blueprint window already has the Folder open, that window keeps the conversation. System starts a new one and says why.

## Alternative Flow 4: The pane changes size

At any step, Developer resizes the pane or the window. Claude Code redraws to fit the new size.

## Slice 1: A Claude session in the window

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 2, Alternative Flow 4.

Work items:

- [x] Open a Folder from the command line or the folder picker ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Run Claude Code in a pane, in the Blueprint look ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Explain start failures and how to fix them ([#1](https://github.com/karsanda/blueprint/issues/1))
- [x] Offer a restart when Claude Code exits ([#1](https://github.com/karsanda/blueprint/issues/1))

Test cases:

- Given Claude Code is signed in, when the Developer opens a Folder, then a Claude session starts there.
- Given a running session, when the Developer types a prompt, then Claude Code receives exactly that text.
- Given Claude Code is not installed, when the Developer opens a Folder, then System explains how to install it.
- Given a running session, when Claude Code exits, then System keeps its output and offers a restart.
- Given a running session, when the Developer resizes the pane, then Claude Code fills the new size.

## Slice 2: Resume after reopening

Covers: Alternative Flow 3.

Work items:

- [x] Resume each Claude tab's conversation when the Folder reopens ([#12](https://github.com/karsanda/blueprint/issues/12))
- [x] Start new conversations when another Blueprint window has the Folder open ([#29](https://github.com/karsanda/blueprint/issues/29))

Test cases:

- Given a Folder had a Claude session, when the Developer reopens Blueprint on it, then the same conversation continues.
- Given a Folder open in one window, when the Developer opens it in another, then that window starts new conversations and says why.

## Resources

- Notes: [Claude sessions](../../domain/claude_sessions/notes.md)
- Related: [Know when Claude needs me](know_when_claude_needs_me.md), [Run several Claude sessions](run_several_claude_sessions.md)
