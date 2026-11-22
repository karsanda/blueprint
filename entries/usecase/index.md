---
type: Collection
title: Use Cases
description: Every Blueprint use case, grouped by label, with the MVP build order
---

Every use case lives in [blueprint/](blueprint) for the [Blueprint](../system/blueprint.md) System. Each one carries `labels` in its frontmatter; this index groups them by label.

- [Actors](../actors/index.md)
- [Diagram](../diagram/blueprint.puml): every use case and its actors, in PlantUML
- [Glossary](../domain/glossary.md)
- [Agent guide](../../AGENTS.md)

## MVP build order

The MVP is the six use cases below. We build them slice by slice, in this order:

1. [Talk to Claude in a pane](blueprint/talk_to_claude_in_a_pane.md), Slice 1, and [Run commands in a shell pane](blueprint/run_commands_in_a_shell_pane.md), Slice 1, inside the tiled layout from [Arrange my panes](blueprint/arrange_my_panes.md), Slice 1
2. [Know when Claude needs me](blueprint/know_when_claude_needs_me.md), Slice 1
3. [Review what Claude changed](blueprint/review_what_claude_changed.md), Slices 1 and 2
4. [Arrange my panes](blueprint/arrange_my_panes.md), Slice 2
5. [Run several Claude sessions](blueprint/run_several_claude_sessions.md), Slices 1 and 2
6. [Talk to Claude in a pane](blueprint/talk_to_claude_in_a_pane.md), Slice 2
7. [Run commands in a shell pane](blueprint/run_commands_in_a_shell_pane.md), Slice 2
8. [Arrange my panes](blueprint/arrange_my_panes.md), Slice 3

## claude

- [Talk to Claude in a pane](blueprint/talk_to_claude_in_a_pane.md)
- [Know when Claude needs me](blueprint/know_when_claude_needs_me.md)
- [Run several Claude sessions](blueprint/run_several_claude_sessions.md)
- [Give a session its own working copy](blueprint/give_a_session_its_own_working_copy.md) (after the MVP)

## shell

- [Run commands in a shell pane](blueprint/run_commands_in_a_shell_pane.md)

## review

- [Review what Claude changed](blueprint/review_what_claude_changed.md)

## workspace

- [Arrange my panes](blueprint/arrange_my_panes.md)

## usecase

- [Give Claude a use case as context](blueprint/give_claude_a_use_case.md) (retired)
