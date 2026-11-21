---
type: Usecase
title: Know when Claude needs me
labels: [claude]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code, Operating system
status: draft
---

The Developer learns at once when a Claude session waits for them, even while looking elsewhere.

## Basic Flow

1. Claude Code asks a question or asks permission in a Claude session.
2. System marks the session as Needs you on its tab, its pane and the title bar.
3. System shows a desktop notification when the window is not in front.
4. Developer clicks the notification or the marked tab.
5. System brings the window forward and focuses the session.
6. Developer answers Claude Code.
7. System marks the session as working.
8. Claude Code finishes its turn, and System marks the session as idle.

## Alternative Flow 1: The window is in front

At step 3, the window is in front. System skips the notification; the marks from step 2 are enough.

## Alternative Flow 2: Notifications are turned off

At step 3, the Operating system blocks notifications. The marks from step 2 still show.

## Alternative Flow 3: Several sessions need the Developer

At step 2, more than one session waits. The title bar lists each one, and each tab shows its own mark.

## Alternative Flow 4: The Developer refuses or stops Claude Code

At step 6 or step 8, the Developer refuses the request or stops Claude Code. Claude Code ends its turn early. System marks the session as idle.

## Slice 1: Status and notification

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 2, Alternative Flow 3, Alternative Flow 4.

Work items:

- [ ] Learn each session's status from Claude Code
- [ ] Mark the tab, the pane and the title bar
- [ ] Notify through the Operating system when the window is not in front
- [ ] Focus the session when the Developer clicks the notification
- [ ] Mark the session idle when the Developer refuses or stops Claude Code

Test cases:

- Given a working session, when Claude Code asks permission, then its tab, pane and title bar show Needs you.
- Given the window is not in front, when a session needs the Developer, then a desktop notification appears.
- Given a notification, when the Developer clicks it, then the window comes forward with that session focused.
- Given a session that needs the Developer, when the Developer answers, then it shows as working.
- Given a working session, when Claude Code finishes its turn, then it shows as idle.
- Given a session mid-turn, when the Developer refuses or stops Claude Code, then it shows as idle.

## Known gaps

- Claude Code sometimes asks a question in plain text. That ends its turn, so the session shows as idle, not Needs you.

## Resources

- Notes: [Claude sessions](../../domain/claude_sessions/notes.md)
- Related: [Talk to Claude in a pane](talk_to_claude_in_a_pane.md)
