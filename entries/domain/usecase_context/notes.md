---
type: Note
title: Use case context
description: Why Blueprint has no use case feature, and what a check against Claude Code found
---

Code-level detail for [Give Claude a use case as context](../../usecase/blueprint/give_claude_a_use_case.md), which is retired: Claude Code handles use cases itself, through `@` file mentions and the Folder's own skills.

## What Claude Code 2.1.330 does with a pasted mention

Checked before the use case was retired, in case a feature comes back that writes into a session's prompt:

- A bracketed paste of `@entries/usecase/blueprint/<slug>.md (Slice 1: <name>)` into an idle session's prompt lands as plain text, with no file suggestions open. On submit, Claude Code reads the file before the turn starts.
- A path with a space works as `@"<path>"`.
- While the session is working, the paste waits in the prompt box.
- While a permission question shows, the paste is dropped without a trace. The question stays unanswered, even though the text holds a digit.
