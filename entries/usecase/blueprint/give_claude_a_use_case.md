---
type: Usecase
title: Give Claude a use case as context
labels: [usecase]
System: Blueprint
Primary Actor: Developer
Supporting Actors: Claude Code
status: draft
---

The Developer grounds a Claude session in a use case from the Folder, so Claude works from the agreed spec.

A Folder can hold use cases in the Use-Case 3.0 format used by this repository and the team's `vidio-usecase` repository.

## Basic Flow

1. Developer opens the use case list.
2. System finds the use cases in the Folder.
3. System lists them by title, grouped by label.
4. Developer picks a use case and a Claude session.
5. System adds a reference to the use case to that session's prompt.
6. Developer finishes the prompt and sends it.
7. Claude Code reads the use case and works from it.

## Alternative Flow 1: No use cases in the Folder

At step 2, System finds none. System says where it looks for use cases.

## Alternative Flow 2: Narrow the list

At step 3, Developer types part of a title. System shows only the matching use cases.

## Alternative Flow 3: Pick one slice

At step 4, Developer also picks one slice. System adds the slice name next to the reference.

## Slice 1: Attach a use case

Covers: Basic Flow, Alternative Flow 1, Alternative Flow 2.

Work items:

- [ ] Find the use cases in the Folder
- [ ] List them by title and label, with a filter
- [ ] Add a reference to the chosen session's prompt

Test cases:

- Given a Folder with use cases, when the Developer opens the list, then each shows its title and labels.
- Given a picked use case, when the Developer chooses a session, then that session's prompt holds a reference to it.
- Given a Folder with no use cases, when the Developer opens the list, then System says where it looks.
- Given a long list, when the Developer types part of a title, then only matching use cases remain.

## Slice 2: Attach one slice

Covers: Alternative Flow 3.

Test cases:

- Given a picked use case and slice, when the Developer chooses a session, then the prompt names that slice.

## Known gaps

- Writing insights back into the use case after a session is a later use case, after the MVP.

## Resources

- Notes: [Use case context](../../domain/usecase_context/notes.md)
- Concepts: [Use cases and agentic coding](../../../doc/guides.md#use-cases-and-agentic-coding)
