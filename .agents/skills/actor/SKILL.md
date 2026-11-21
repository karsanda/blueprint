---
name: actor
description: Add, change, rename or remove an actor in entries/actors/, and change the System boundary in entries/system/blueprint.md. Use when the user says things like "add actor", "new actor", "rename actor", "merge actors", "is X inside the system", or "change the system boundary".
---

# Actors and the System boundary

An actor is a person or outside party that interacts with Blueprint. Blueprint's own window, panes and background work are inside the System and are never actors. Shared layout and the link check are in `AGENTS.md`. Adapted from the team's `vidio-usecase` repository.

## What to update

| Change | `entries/actors/<actor>.md` | `entries/actors/index.md` | `entries/system/blueprint.md` | Use case files |
| --- | --- | --- | --- | --- |
| Add an actor | create | add a line | list it under "Outside the boundary" | no |
| Rename an actor | `git mv`, update `title` | update the line | update the name | update `Primary Actor`, `Supporting Actors` and steps that name it |
| Merge two actors | keep one, `git rm` the other | remove the line | remove the name | rename it in every use case |
| Remove an actor | `git rm` | remove the line | remove the name | only after no use case names it |
| Move something across the boundary | no | no | update both lists | update steps and actor fields of affected use cases |

Find affected use cases with `rg -l '<Actor name>' entries/usecase`.

## Add an actor

1. Check first: `rg -i '<name>' entries/actors entries/system`. Do not add a second word for an existing actor.
2. Confirm it is outside the System. If it is part of Blueprint, it is System, not an actor.
3. Add a file only for an actor that is the primary actor of at least one use case, or that already has one. A supporting actor otherwise stays a plain name in use case frontmatter and in the System's "Outside the boundary" list.
4. Create `entries/actors/<actor>.md` (`snake_case`) with frontmatter `type: Actor` and `title` only. The body says who the actor is.
5. Write one or two sentences: who the actor is and what it wants from Blueprint.
6. Add `- [<Actor>](<actor>.md)` to `entries/actors/index.md`.
7. Add the actor to `entries/system/blueprint.md` under "Outside the boundary".
8. Run `task check`.

## `entries/system/blueprint.md` rules

- It says what "System" means for every use case. It is not a glossary.
- Update it when something moves inside or outside the System, or when an actor is added, renamed or removed.
- Keep term definitions out of it. Terms go to `entries/domain/glossary.md` (see the `usecase` skill).
- Do not name components inside the System.

## Done

- [ ] Every file in the table row is updated.
- [ ] Every use case naming a changed actor is updated.
- [ ] `task check` prints only `check-done`.
- [ ] The report lists each changed file.
