---
type: Usecase
title: Use case title
System: Blueprint
Primary Actor: Developer
Supporting Actors: Actor that help use case fulfill the goal, external service for example. Or none
Includes: Other use case (omit if none)
Extend: Other use case (omit if none)
status: draft
---

Description. Narration, overview of the use case in simple paragraph forms. Start with the goal: what the primary actor gets when this succeeds.

It can also be more detailed elaboration of goals, preconditions, trigger etc. Feel free to use bullet points or heading/section as needed.

Can also be empty and go straight to the flows below if things are already clear from title and context.

System, actors and included use cases are named in the frontmatter only; no need to repeat them in the body.

## Basic Flow

Can have short sentence or description if needed.

1. Step 1
2. Step 2
3. Step N

## Alternative Flow 1: For example when network not available

Format is like basic flow but for non-typical use, exception, edge cases etc.

1. Step 1
2. Can just be informal and refer to basic flow e.g: same as basic flow but at step x this happens instead

## Alternative Flow 2: Some other exceptional case happen.

Some description if needed.

## Slice 1: Basic Flow

Can have description if needed.

Covers: Basic Flow, Alternative Flow 2.

Work items:

- [x] task 1
- [ ] task 2
- [ ] task 3
- [ ] task 4

Test cases:

- Agreed-on test cases with all parties can be listed here, e.g. Given / when / then

## Slice 2: When network is down

Covers: Alternative Flow 1.

## Other sections (optional)

Reference material that supports the flows, e.g. rules, tables, known gaps, terms. Placed after the slices.

## Resources

- Epic docs
- Designs
- Related use cases
- etc..
