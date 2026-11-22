---
type: Note
title: Review
description: How Blueprint records the Folder's state, computes Changes and tells who made them
---

Code-level detail for [Review what Claude changed](../../usecase/blueprint/review_what_claude_changed.md). Snapshots and diffs were proven in the feasibility prototype. The timing and attribution rules were checked against Claude Code 2.1.330 on 2026-11-21 (see [Claude sessions](../claude_sessions/notes.md)).

## Snapshots

A snapshot is the whole Folder as a git tree. Blueprint makes it with its own index file and its own object store, so the Developer's staging area, files and repository are never written:

```sh
export GIT_INDEX_FILE=<store>/index
export GIT_OBJECT_DIRECTORY=<store>/objects
export GIT_ALTERNATE_OBJECT_DIRECTORIES=<the repository's objects dir>
git add -A -- . ':(exclude,attr:filter=lfs)'
git write-tree
```

- `<store>` is one folder per Folder. For the Blueprint that holds the Folder (see [Claude sessions](../claude_sessions/notes.md), One Blueprint per Folder) it is `<user data>/review-kept/<folderKey>`, kept across runs so This session survives a reopen (see Kept sessions below). Any other Blueprint uses a folder that belongs to its run: `<user data>/review-<pid>-<random>`. Blueprint removes that one on quit, and on start removes any left by a run whose process is gone. So two Blueprints on one Folder never share a store.
- An index never outlives its objects: an index whose objects are gone breaks `write-tree`. The kept store keeps its objects, but each run gets a fresh index of its own, `index-<pid>-<random>`, and removes those of earlier runs. A git an earlier run left running can finish after the next run has wiped the store; with one shared index it wrote back entries whose objects were gone, and every snapshot failed with `invalid object`. An earlier index may also name objects the repository has collected since.
- The repository's objects dir is `git rev-parse --path-format=absolute --git-path objects`, which also works in a linked worktree.
- `-- .` keeps the snapshot to the Folder when the Folder is a subfolder of a repository.
- `.gitignore` is respected, and untracked files are included.
- Every git command that reads a snapshot (`write-tree`, `diff`) runs with the same environment.
- Every git command, `rev-parse` included, also gets config through `GIT_CONFIG_COUNT`: `core.fsmonitor=false`, `core.splitIndex=false`, `core.hooksPath=/dev/null`, `gc.auto=0` and `core.safecrlf=false`. Checked on git 2.56.1: without the first four, the repository's config made a snapshot start an fsmonitor daemon that kept running, write `fsmonitor--daemon*` and `sharedindex.*` into `.git`, and run a `post-index-change` hook. Without the last, `core.autocrlf=input` with `core.safecrlf=true` made every snapshot fail on a file with mixed line endings. `core.safecrlf` only checks; it never writes.
- The repository's attributes apply, from `.gitattributes`, `.git/info/attributes` or a global attributes file. Eol rules and clean filters run as in the Developer's own `git add`.
- Files stored with Git LFS are left out by the `:(exclude,attr:filter=lfs)` pathspec. Git LFS's filter writes each file it cleans into `.git/lfs/objects`, and a raw LFS file goes into the store whole, on every launch. Their Changes are not listed, a known gap. Checked on git 2.56.1: with the empty tree as `GIT_ATTR_SOURCE`, a 2 MB LFS file put 2 MB into the store. An empty `filter.lfs.process` does too: git then runs no `filter.lfs.clean` either, since a process filter takes precedence.
- The one-file diff runs as `git --literal-pathspecs diff`, so a path like `app/[id]/page.tsx` names that file only, not a glob. The add cannot read pathspecs literally: its exclude needs pathspec magic.
- Snapshots of one Folder run one at a time. Two `git add` runs on one index file collide on its lock.
- Without Git, or outside a repository, Blueprint takes no snapshots and holds no replies. A repository with no commits works: `git init` already made its objects dir.
- Checked: after a change, a snapshot added 6 objects to the store and none to the repository, and `git status` was unchanged.
- Measured: 3 ms on Blueprint's own Folder. On 50,000 files, about 250 ms for the first snapshot and 25 ms after. Copying the repository's `.git/index` in as the starting index brings the first down to about 30 ms. Blueprint does not: a split index or an fsmonitor extension makes that copy unsafe.
- Opening a Folder waits only for `rev-parse`. The first snapshot runs in the background, so the window does not wait for it.

### Slow and failing Git

- Claude's start waits for the session base, and the reply to `UserPromptSubmit` and `PreToolUse` waits for its snapshot. Each wait races one 8-second timer that covers the queue too. A wait never exceeds 8 seconds, under the 10-second timeout of those hooks.
- Git goes on after the wait ends. A git command is stopped only after 5 minutes, which frees the snapshots queued behind a hung git. Stopping it sooner saves no work: the next `git add` would start cold again. A snapshot that fails frees the next one.
- `rev-parse` is stopped after 8 seconds: it reads no working files, and the window waits for it. One that gives no answer says nothing about the Folder. The Changes pane says Git could not read it, and each refresh tries to open the store again until it opens.
- A snapshot that lands after its wait ended still counts:
  - The session is registered when Claude starts, with its base pending, so its hooks count while the base is read.
  - A late turn base still becomes the turn base for its prompt, unless a newer Developer prompt arrived since. The turn itself starts when the prompt arrives, so what Claude touches while the base is read belongs to it.
  - A late snapshot before a command still pairs with the snapshot after it. When it reads the Folder after the command has written, that command's files count as outside Claude.
  - A late base may include Claude's first edits. Those then do not show.
  - Snapshots run in order, so each one that succeeds becomes the latest tree, whichever moment took it. A list never compares a base with an older tree.
- While the shown range's base is read, the Changes pane says `Review is reading this Folder with Git.`
- When a snapshot or the list fails, for example on a git stopped at 5 minutes or a deleted Folder, the Changes pane says `Review could not read this Folder with Git. It tries again shortly.` The next refresh that succeeds replaces it. A base whose snapshot failed shows that message too. The next snapshot that succeeds, from a refresh or a hook, becomes that base.

### When Blueprint takes one

| Moment | Snapshot | Used for |
| --- | --- | --- |
| Blueprint starts Claude, before the process runs | session base | This session |
| `UserPromptSubmit` from the Developer, before replying | turn base | This turn |
| `PreToolUse` for `Bash`, before replying | before the command | who made a Change |
| `PostToolUse` or `PostToolUseFailure` for `Bash` | after the command | who made a Change, refresh |
| Any other `PostToolUse`, `Stop`, any Blueprint window coming to the front, and every 2 seconds while the Changes pane is visible | now | refresh |

- The status signal goes out when the hook arrives. Only the reply waits for the snapshot.
- Claude Code waits for the reply to `UserPromptSubmit` and `PreToolUse` hooks, up to the hook's timeout. Holding the reply until the snapshot is written puts the base before Claude's first edit. These two hooks get a 10-second timeout, and Blueprint holds the reply at most 8 seconds. Past their timeout, Claude Code goes on silently.
- Claude Code also fires `UserPromptSubmit` for its own messages: `<task-notification>` when a background command ends, and `<agent-message from="…">` when a subagent hands back. A prompt that begins with either does not start a turn: This turn stays on the Developer's last prompt. It still marks the session Working. The format is not documented: Blueprint relies only on these two openings.
- A refresh that finds a snapshot already running skips. While the shown range's base is read, a refresh says so at once instead.
- Review state belongs to one Claude start of a tab, keyed by its start key like the hooks: the session base, the turn base and the touched paths. Restarting the tab replaces it. `/clear` keeps it, although Claude Code's `session_id` changes.

### Kept sessions

This session survives a reopen ([#27](https://github.com/karsanda/blueprint/issues/27)), for the Blueprint that holds the Folder.

- Each conversation gets a record `<kept store>/sessions/<session id>.json`: the session base's tree and every path the session touched since its start. The id must be a session id (a UUID), so it never names another file.
- The record is written when the base lands, at each touch, and at a prompt that names a new session id. It follows the conversation the tab saves: after `/clear` it moves to the new id at the next prompt, as the tab's saved conversation does.
- A tab that resumes a conversation gets its record back: the old base, and its touched paths credited to the tab again. This turn starts over: it says there is no prompt yet. A record whose base tree is gone from the store is ignored, and a new base is taken.
- Closing a tab drops its record, and so does a start that does not continue the tab's conversation, such as Restart. Records untouched for 30 days are dropped when the Folder opens. When none is left, the whole kept store goes, so it starts afresh instead of growing. What cannot go stays for a later run, such as objects a git of an earlier run still writes there: no kept session needs them. An earlier wipe that failed this way stopped the store from opening, and the review said the Folder was not a Git repository.
- Known gap: while a conversation stays open for weeks, the kept store keeps every snapshot's new objects.

### Why not a file watcher

Node's recursive `fs.watch` adds an inotify watch for every directory, ignored ones like `node_modules` included, and this machine's limit is 65,536. A watcher would also need its own ignore rules. Snapshots let Git apply `.gitignore` and cost milliseconds. The price: an edit outside Claude shows within 2 seconds, not at once.

## Computing Changes

- The list is `git diff --raw --no-abbrev --no-renames <base> <now>`, with `--numstat` for the counts. A count of `-` means a binary file.
- Each Change carries a content id from `--raw`: the new blob, or the old one for a deleted file. A file that changes again with the same counts still sends a new list, so the difference follows it.
- The difference for one file is `git diff --no-color --no-renames <base> <now> -- <path>`. A new or deleted file shows whole.
- This turn compares with the turn base. Before the first prompt there is no turn base, and the Changes pane says so.
- This session compares with the session base.

## Who made a Change

A Change is made by every Claude session that touched its path in the chosen range: this turn, or this session, of the session the Changes pane shows. A Change no session touched is changed outside Claude.

Claude touched a path when:

- a `PostToolUse` for `Write`, `Edit` or `NotebookEdit` named it (`tool_input.file_path`, or `tool_input.notebook_path`). The path is absolute; Blueprint makes it relative to the Folder. Claude Code runs in the Folder's real path, so for a Folder opened through a symlink the path is under the real path. Blueprint matches it against the Folder as given and its real path, and by the file's own real path when the file exists.
- it differs between the snapshots before and after one of Claude's `Bash` commands. The two hooks share a `tool_use_id`, and the after snapshot comes from `PostToolUse` or, when the command fails, `PostToolUseFailure`.

A subagent's tool hooks reach the same start key, so its edits count as the session's.

Claude Code can run a subagent in the background. The turn then ends at once. The subagent's edits, and its permission prompts, arrive during a later turn. There they count as Claude's.

Blueprint keeps one touch log for the Folder: each touch records the path, the session's tab and a sequence number. A range starts at the sequence number reached when its base was taken: the shown session's latest Developer prompt for This turn, its start for This session. So a path Claude touched before the range and the Developer changed since counts as outside Claude. A closed session's touches stay in the log, under its last name.

Two sessions overlap when both touched the same path since each of them started. Both tabs then show an overlap mark that names the other session and lists the paths. The mark goes when one of the two closes or restarts.

Known gaps, also listed in the use case:

- `Bash` with `run_in_background` fires `PostToolUse` when the command starts. Its later changes count as outside Claude.
- A Developer edit made while a Claude `Bash` command runs counts as Claude's. So does one made while its permission prompt waits: the prompt falls between `PreToolUse` and `PostToolUse`.
- A file that both Claude and the Developer changed counts as Claude's.
- While one session runs a `Bash` command, another session's edits in that time count as the first session's too.
- An overlap mark stays until one of the two sessions closes or restarts.
- MCP tools are not in the `PreToolUse` and `PostToolUse` handling. Files they change count as outside Claude.
- Files stored with Git LFS are not listed. Snapshots leave them out.

One more gap, too fine for the use case:

- The snapshot after a `Bash` command runs in the background. When the next prompt arrives first, the command's touches can land in the next turn.

## Panes

- Changes: a narrow pane on the left, full height. It shows the Claude session focused last; its header names that session and switches between This turn and This session. Each row shows ● with the names of the sessions that made it, or ○ for changed outside Claude, then the path, and the added and removed line counts. Picking a row shows that Change in the Difference pane.
- Difference: top right. It shows the picked Change and follows each refresh. It empties when the Change leaves the list.
- When the Folder is not under Git, or Git is not installed, the Changes pane explains that review needs Git.
- Main owns the snapshots and the git calls. How the list and the difference reach the renderer is left to the build.

## Drawing the difference

- Blueprint's own renderer, not Monaco. It parses the unified diff into rows and change blocks, highlights with Shiki and draws a revision cloud around each change block.
- Shiki loads a small fixed set of languages when first needed. Other files show plain.
- Revision clouds mark the Changes any Claude session made. A Change outside Claude shows plain.
- The revision cloud is a scalloped SVG path sized to the block (`cloudPath` in `~/Workspace/blueprint-prototype/src/looks/looks.js`).

## Checked in the real app

Checked on 2026-11-21 with the built app and Claude Code 2.1.330, in manual mode, on a scratch Git repository:

- `Write` and `Bash` Changes showed as Claude's in This turn. A failing `Bash` command did too.
- Each permission prompt stayed open until answered, so Blueprint's `PreToolUse` hook did not answer it. Folder hooks ran beside Blueprint's.
- An edit from the Shell pane showed as outside Claude within 1 second.
- A background command left This turn unchanged. Its late file showed as outside Claude, the known gap.
- This session kept every earlier Change, also after `/clear`.
- The difference showed one revision cloud on Claude's Change, and none on a Change outside Claude.
- The repository's object count and `git status` were untouched, apart from the changed files.

## Open checks

- The store's trees can point at objects that live only in the repository. If the Developer's `git gc` prunes one during a session, a diff fails. Untested.
- Clean filters run on each snapshot, from any attributes file: `.gitattributes`, `.git/info/attributes` or a global one. One that writes into the repository would write there on every snapshot. Git LFS's is the only such filter known, and it is left out. Untested with others.
