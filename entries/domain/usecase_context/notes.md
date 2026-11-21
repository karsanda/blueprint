---
type: Note
title: Use case context
description: How Blueprint finds use cases and hands one to a Claude session
---

Code-level detail for [Give Claude a use case as context](../../usecase/blueprint/give_claude_a_use_case.md).

## Finding use cases

- Look for Markdown files under `entries/usecase/` in the Folder, at any depth, whose frontmatter has `type: Usecase`. This matches this repository and `vidio-usecase`.
- Read `title`, `labels` and `status` from the frontmatter, and the `## Slice n: <name>` headings from the body.
- When nothing matches, the empty state names `entries/usecase/` as the place Blueprint looks.

## Handing one to a session

- Blueprint types an `@<path>` file mention into the chosen session's prompt, for example `@entries/usecase/blueprint/review_what_claude_changed.md`. Claude Code reads mentioned files itself.
- With a slice, it adds the slice name after the mention, for example `(Slice 1: This turn)`.
- The text goes in as a bracketed paste and is not submitted, so the Developer finishes the prompt.

## Later

- Writing insights back to the use case after a session (the feedback flywheel) is a separate use case after the MVP.
