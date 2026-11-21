# Blueprint

A desktop app for working with Claude Code: Claude sessions, shells and a review of what Claude changed, tiled in one window. Requirements are written as use cases first, one goal per entry, told without code. Concepts: [doc/guides.md](doc/guides.md). Entry structure: [doc/template.md](doc/template.md).

This file is the agent-independent guide: any coding agent should read it first.

## How work flows

1. Every feature starts as a use case in `entries/usecase/blueprint/`.
2. A slice is the unit we build. Its `Test cases:` (Given / when / then) become the first failing tests.
3. Insights from a coding session go back into the use case, or into notes under `entries/domain/`.

## Task guides

Each task has a guide, written as an Agent Skill in `.agents/skills/<name>/SKILL.md`. Read and follow the matching one before changing entries. `.claude/skills` is a symlink to `.agents/skills` for Claude Code.

- [Use cases](.agents/skills/usecase/SKILL.md): add, change, rename, relabel or retire a use case, and shared glossary terms.
- [Actors](.agents/skills/actor/SKILL.md): add, change or remove an actor, and the System boundary in `entries/system/blueprint.md`.

The format and both guides are adapted from the team's `vidio-usecase` repository.

## Layout

```text
.
├── AGENTS.md                 this guide (CLAUDE.md imports it)
├── .agents/skills/           task guides as Agent Skills
├── scripts/                  check_links_integrity.sh (`task check`)
├── doc/
│   ├── guides.md             use case concepts
│   ├── template.md           entry template
│   └── plans/                one implementation plan per build step
├── src/                      the app: main/ (Electron main process), preload/, renderer/ (React), shared/ (types)
├── tests/e2e/                slice tests (Playwright) against the built app; fixtures/ holds fake programs
└── entries/
    ├── system/blueprint.md   the System boundary
    ├── usecase/blueprint/<slug>.md  one use case
    ├── usecase/index.md      every use case, grouped by label, with the MVP build order
    ├── actors/<actor>.md     one actor: who it is and what it wants
    ├── actors/index.md       list of every actor
    ├── diagram/<name>.puml   optional PlantUML diagrams; SVGs are not committed
    ├── domain/glossary.md    terms used by two or more use cases
    └── domain/<topic>/       notes with detail that needs code, e.g. review/notes.md
```

## Code

- A slice's test cases become Playwright tests in `tests/e2e/`, each named after its Given / when / then line, run against the built app. Fake `claude` and shell programs in `tests/e2e/fixtures/` record what they receive. Tests read terminals through the e2e probe (`src/shared/probe.ts`), because WebGL draws them on a canvas.
- Pure logic gets Vitest tests beside the source, as `*.test.ts`.
- `pnpm dev -- <folder>` opens Blueprint on a Folder: the `--` hands the path to Electron.
- `pnpm e2e` opens real windows on the desktop, one test at a time, and restores the clipboard it uses.
- If `pnpm install` leaves Electron without its binary, run `node node_modules/electron/install.js`.

## Shared conventions

- File names are `snake_case.md`. Slugs are unique across the repo.
- A use case lives in `entries/usecase/blueprint/`. No deeper subfolders.

## Before you finish

1. Run `task check` (or `sh scripts/check_links_integrity.sh`). It must print only `check-done`.
2. After code changes, `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm e2e` passes.
3. List every file you changed in your report.
