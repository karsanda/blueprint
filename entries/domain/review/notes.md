---
type: Note
title: Review
description: How Blueprint records the Folder's state and computes Changes
---

Code-level detail for [Review what Claude changed](../../usecase/blueprint/review_what_claude_changed.md). Proven in the feasibility prototype.

## Recording the state

On `UserPromptSubmit`, and when a session starts, Blueprint records the whole Folder as a git tree. It uses a temporary index, so the Developer's staging area and files are never touched:

```sh
GIT_INDEX_FILE=<blueprint index for this Folder> git add -A
GIT_INDEX_FILE=<blueprint index for this Folder> git write-tree
```

- The temporary index is reused per Folder, so `git add -A` only re-hashes files that changed.
- `.gitignore` is respected, and untracked files are included.
- The only side effect is unreferenced git objects, which git's normal garbage collection removes.

## Computing Changes

- Take a new tree the same way, then compare the trees with `git diff --name-status --no-renames <base> <now>` and `--numstat` for the counts.
- The difference for one file is `git diff --no-color --no-renames <base> <now> -- <path>`.
- This turn uses the last turn snapshot; This session uses the session-start snapshot.
- Attribution: a path from a `PostToolUse` hook's `tool_input.file_path` belongs to that session. A Change with no attribution is "changed outside Claude".

## Drawing the difference

- Blueprint's own renderer, not Monaco. It parses the unified diff into rows and change blocks, highlights with Shiki and draws a revision cloud around each change block.
- The revision cloud is a scalloped SVG path sized to the block (`cloudPath` in the prototype's `src/looks/looks.js`).
