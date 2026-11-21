# Use case guide

Blueprint uses the same Use-Case 3.0 approach as the team's `vidio-usecase` repository. This is the short version; the full guide lives there, in `doc/guides.md`.

## What a use case is

- A unit of feature: **one goal** for **one primary actor**, and the steps to reach it.
- A Basic Flow: the simple happy path to the goal.
- Alternative Flows: other ways to reach, or fail to reach, the same goal. Exceptions and edge cases go here.
- A hub for everything about the goal: slices, work items, test cases, designs and decisions.

Epics and stories fade once delivered. A use case stays live: it is the single source of truth for what Blueprint does, kept current as features change.

## Use case, slice and work item

- **Slice**: a delivery unit with real value to the actor. It lists the flows it covers, its work items and its test cases. We build one slice at a time.
- **Work item**: a unit of work inside a slice. It can be partial, like adding a hook listener.
- **Test cases**: Given / when / then lines agreed for the slice. They become the first failing tests when the slice is built.

## Concepts

- **Primary Actor**: the person who wants the goal. In Blueprint this is the Developer.
- **Supporting Actor**: an outside party the use case relies on, like Claude Code, Git or the Operating system.
- **System**: the scope of the use case. Blueprint is [one System](../entries/system/blueprint.md); everything outside it is an actor.

## Include and extend

- A use case **includes** another when they share a part, or a part is complex enough to stand alone.
- A use case **extends** another when it adds behavior under a condition. The extended use case still works without it.

## Use cases and agentic coding

A use case written in enough detail is a ready context bundle for a coding session. The agent reads the use case and the slice it builds, so the work stays anchored on the agreed goal. New insights from the session go back into the use case or its notes, so the next session starts smarter. This follows two patterns:

- [Context Anchoring](https://martinfowler.com/articles/reduce-friction-ai/context-anchoring.html#ExternalMemory)
- [Feedback Flywheel](https://martinfowler.com/articles/reduce-friction-ai/feedback-flywheel.html)

Blueprint itself supports this loop: [Give Claude a use case as context](../entries/usecase/blueprint/give_claude_a_use_case.md).

## Miscellaneous

- Text entries are the source. Diagrams only highlight one aspect, like a cluster of related use cases.
