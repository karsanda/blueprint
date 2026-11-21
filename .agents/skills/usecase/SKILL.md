---
name: usecase
description: Add, change, rename, relabel or retire a Blueprint use case entry in entries/usecase/blueprint/, including its flows, slices, work items, test cases and terms, and add or change shared glossary terms in entries/domain/glossary.md. Use when the user says things like "add usecase", "new use case", "add a slice", "add test cases", "update the flow", "rename/retire a use case", "move to label X" or "add a term".
---

# Use case entries

A use case is all the ways one actor achieves one goal, told without code. Shared layout and the link check are in `AGENTS.md`. Concepts are in `doc/guides.md`. Adapted from the team's `vidio-usecase` repository.

## What to update

Update every file marked in the row, in the same change.

| Change | Use case file | `entries/usecase/index.md` | `entries/domain/glossary.md` |
| --- | --- | --- | --- |
| Add a use case | create | add a line | if a shared term is new |
| Rename a use case | `git mv`, update `title` and every link to it | update the line | no |
| Change its labels | edit `labels` | move the line | no |
| Retire a use case | set `status: retired` | keep the line, add "(retired)" | no |
| Add or change a shared term | link to the glossary | no | yes |

If the primary actor has no file in `entries/actors/`, use the `actor` skill to add it first. If the change moves something across the System boundary, use the `actor` skill for `entries/system/blueprint.md`.

## Add a use case

1. Search first: `rg -i '<keyword>' entries/usecase`. If a use case with the same actor and goal exists, extend it and stop.
2. Pick the primary actor: the person who wants the goal. Pick the labels.
3. Copy `doc/template.md` to `entries/usecase/blueprint/<slug>.md`. The slug is a verb phrase from the actor's side, e.g. `review_what_claude_changed`.
4. Frontmatter, in this order: `type: Usecase`, `title`, `labels`, `System: Blueprint`, `Primary Actor`, `Supporting Actors` (or `none`), `Includes` and `Extend` only when used, `status: draft`. Use plain names; do not repeat them as links in the body.
5. Body, in this order:
   - The goal sentence: what the primary actor gets when this succeeds. Optional description, trigger or preconditions as `###` subsections.
   - `## Basic Flow`: numbered steps ending with the value delivered.
   - `## Alternative Flow n: <condition>`: one per alternative. Say which basic step it branches from. It can be one line that refers back to the Basic Flow.
   - `## Slice n: <name>`: a delivery unit with real value to the actor. Contains `Covers:` (which flows), `Work items:` (checkbox list, linked to tracker issues when known) and `Test cases:` (Given / when / then lines). Leave a blank line after each label.
   - Optional reference sections: rules, tables, known gaps.
   - `## Terms`, then `## Resources` (designs, decisions, related use cases, notes).
6. Add the line `- [<Title>](blueprint/<slug>.md)` under the label heading in `entries/usecase/index.md`.
7. Check terms with the glossary rules below.
8. Run `task check`.

## Include and extend

- `Includes`: a part shared with other use cases, or a part complex enough to be its own use case. The including flow names it in a step.
- `Extend`: adds behavior to another use case under a condition. The extended use case still works if the extension is removed.

## Writing rules

- Write in English.
- One idea per sentence. 20 words at most. Active voice. Present tense.
- Every step names its actor: Developer, Claude Code, Git, Operating system, or System. Blueprint's window, panes and background work are System.
- No code and no mechanism. No file paths, class, function, event, flag, protocol or library names. Do not name components: Electron, React, xterm.js, node-pty, dockview and hooks are all "System".
- Detail that needs code goes to a notes file under `entries/domain/<topic>/`, linked from Resources.
- Blueprint runs on Linux first. If another platform is added, an actor-visible difference becomes an alternative flow named after the platform; a mechanism-only difference goes to the notes.
- Limits: 10 basic steps, 8 alternative flows, 6 test cases, 5 terms.

## Glossary rules

1. Before you define a term, search `entries/domain/glossary.md`.
2. If the term is there, do not define it again. Use the same word with the same meaning.
3. If two or more use cases use the term, it goes in the glossary. Keep the table alphabetical. One row per term, one meaning per term.
4. If only one use case uses the term, it goes in that use case's `## Terms`.
5. When a term moves to the glossary, delete its definition from each use case's `## Terms`.
6. Never use two words for one thing, or one word for two things.
7. Actors are not glossary terms. They live in `entries/actors/`.

## Done

- [ ] Every file in the table row is updated.
- [ ] No term is defined in two places.
- [ ] No `[[wikilinks]]`, no code names.
- [ ] `task check` prints only `check-done`.
- [ ] The report lists each changed file.
