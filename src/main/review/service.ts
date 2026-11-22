import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Change, FileDiff, Overlap, ReviewState, ReviewView } from '../../shared/api'
import type { HookInput } from '../status/hooks'
import { isClaudeCodesOwnPrompt, pathInFolder, TouchLog } from './attribution'
import { GitTimeout, SnapshotStore, type GitProblem } from './git'
import { forgetKept, type KeptSession, pruneKept, readKept, writeKept } from './kept'

const NO_GIT_MESSAGES: Record<GitProblem, string> = {
  'no-git': 'Review needs Git, and Git is not installed.',
  'not-a-repo': 'Review needs Git. This Folder is not a Git repository.',
}
const NOT_STARTED = 'Changes show here once Claude starts.'
const NO_PROMPT = 'No prompt yet. Changes show here after your first prompt.'
const GIT_FAILED = 'Review could not read this Folder with Git. It tries again shortly.'
const READING = 'Review is reading this Folder with Git.'
/** How long Claude's start and a hook's reply wait for a snapshot: under the 10 s timeout of those hooks. */
const WAIT_MS = 8000
const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

function realPath(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

/**
 * The Folder paths an edit tool's file names. Claude Code runs in the Folder's real path, so the file is
 * matched against the Folder as given and as its real path, and an existing file by its own real path too.
 * A deleted file has no real path, and is matched as written.
 */
function editedPaths(folder: string, folderReal: string | undefined, file: string): Set<string> {
  const paths = new Set<string>()
  for (const root of [folder, folderReal]) {
    for (const f of [file, realPath(resolve(folder, file))]) {
      const path = root === undefined || f === undefined ? null : pathInFolder(root, f)
      if (path !== null) paths.add(path)
    }
  }
  return paths
}

/**
 * A snapshot a range compares with. It is pending until its tree is read. When its snapshot fails, the next
 * snapshot that succeeds becomes its tree.
 */
interface Base {
  tree?: string
  failed: boolean
  /** Settles when the base's own snapshot does. */
  done: Promise<unknown>
}

/** What Blueprint keeps for one Claude start of a tab, keyed by its start key. */
interface Session {
  tabId: string
  base?: Base
  turnBase?: Base
  /** The touch log's mark at the session's start, and at its latest Developer prompt. */
  start: number
  prompted: number
  /** Snapshots taken before each Bash command, by tool_use_id. They may still be running. */
  before: Map<string, Promise<string>>
  /** The conversation the tab is in, which a reopen resumes. `/clear` changes it at the next prompt. */
  conversation?: string
}

/** Keeps each Claude session's review: the snapshots it compares with, who made each Change, and the state to show. */
export class ReviewService {
  private readonly pollMs: number
  private readonly git: string
  private readonly waitMs: number
  private readonly timeoutMs: number | undefined
  private readonly openTimeoutMs: number | undefined
  private store: SnapshotStore | undefined
  private problem: GitProblem | undefined
  /** Set while the Folder's store could not open because `rev-parse` gave no answer. A refresh tries again. */
  private unopened = false
  private reopening = false
  private folder: string | null = null
  /**
   * The dir that keeps this Folder's review across runs, when this Blueprint holds the Folder. Each
   * conversation's session base and touched paths are kept there, so This session survives a reopen.
   */
  private keptDir: string | undefined
  /** The Folder's real path. Claude Code names files under it. */
  private folderReal: string | undefined
  private opening: Promise<void> = Promise.resolve()
  private readonly sessions = new Map<string, Session>()
  /** The newest start. The shown session when the view's tab has none. */
  private shownKey: string | undefined
  /** Every touch in the Folder, by every session, including ended ones. */
  private log = new TouchLog()
  private lastOverlaps = '[]'
  private latest: string | undefined
  private view: ReviewView = { range: 'turn', visible: false, tabId: null }
  private poll: ReturnType<typeof setInterval> | undefined
  private lastSent: string | undefined
  private generation = 0
  private closed = false
  /** Counts Folder changes, so work that began under an earlier Folder can tell. */
  private folderEpoch = 0

  /**
   * `waitMs` bounds how long Claude's start and a hook's reply wait for a snapshot. `timeoutMs` and
   * `openTimeoutMs` are the store's kill limits for its commands and for `rev-parse`.
   */
  constructor(
    private readonly runDir: string,
    private readonly send: (state: ReviewState) => void,
    private readonly sendOverlaps: (overlaps: Overlap[]) => void,
    opts: { pollMs?: number; git?: string; waitMs?: number; timeoutMs?: number; openTimeoutMs?: number } = {},
  ) {
    this.pollMs = opts.pollMs ?? 2000
    this.git = opts.git ?? 'git'
    this.waitMs = opts.waitMs ?? WAIT_MS
    this.timeoutMs = opts.timeoutMs
    this.openTimeoutMs = opts.openTimeoutMs
  }

  /**
   * Opens the review store of the Folder. The first snapshot runs after it, in the background. `keptDir`
   * is given only to the Blueprint that holds the Folder: its sessions are kept there across runs.
   */
  setFolder(folder: string | null, keptDir?: string): Promise<void> {
    const open = this.opening.then(() => this.open(folder, keptDir))
    this.opening = open
    return open
  }

  private async open(folder: string | null, keptDir: string | undefined): Promise<void> {
    this.folderEpoch++
    // A refresh still running for the earlier Folder sends nothing.
    this.generation++
    this.folder = folder
    this.keptDir = folder === null ? undefined : keptDir
    this.folderReal = folder === null ? undefined : realPath(folder)
    this.store = undefined
    this.problem = undefined
    this.unopened = false
    this.latest = undefined
    this.sessions.clear()
    this.shownKey = undefined
    this.log = new TouchLog()
    this.sendOverlapsIfChanged()
    await this.openStore()
    // A slow Git holds back neither the window nor Claude's start.
    this.background(() => this.refresh())
  }

  /**
   * Opens the store of the current Folder. When `rev-parse` gives no answer, the store stays unopened: the
   * review says Git could not read the Folder, and the next refresh tries again.
   */
  private async openStore(): Promise<void> {
    const folder = this.folder
    if (folder === null) return
    try {
      const kept = this.keptDir
      if (kept) pruneKept(kept, Date.now())
      const hash = createHash('sha256').update(folder).digest('hex').slice(0, 16)
      const opened = await SnapshotStore.open(folder, kept ?? join(this.runDir, hash), {
        git: this.git,
        timeoutMs: this.timeoutMs,
        openTimeoutMs: this.openTimeoutMs,
        keep: kept !== undefined,
      })
      this.unopened = false
      if (opened instanceof SnapshotStore) this.store = opened
      else this.problem = opened.problem
    } catch (error) {
      this.warn('open the review store', error)
      this.unopened = error instanceof GitTimeout
      if (!this.unopened) this.problem = 'not-a-repo'
    }
  }

  /** Tries again to open the store that `rev-parse` held up. Queued like a Folder change. */
  private reopen(): void {
    if (this.reopening) return
    this.reopening = true
    const epoch = this.folderEpoch
    const reopened = this.opening.then(async () => {
      if (epoch === this.folderEpoch && this.unopened) await this.openStore()
    })
    this.opening = reopened
    this.background(async () => {
      try {
        await reopened
      } finally {
        this.reopening = false
      }
      if (epoch === this.folderEpoch && this.store) await this.refresh()
    })
  }

  /** `resume` is the conversation the start resumes: its session goes on where the last run left it. */
  async startSession(tabId: string, startKey: string, resume?: string): Promise<void> {
    // The session base comes before Claude's first edit, unless Git takes longer than the wait.
    await this.hold(this.begin(tabId, startKey, resume), 'take the session base', true)
    // The refresh need not hold Claude back. It runs even while the base is still read, to show the session.
    this.background(() => this.refresh(true))
  }

  /**
   * Registers the session once the Folder is open, and takes its base. A resumed conversation that was kept
   * gets its base and its touched paths back instead. Settles when the base does.
   */
  private async begin(tabId: string, startKey: string, resume?: string): Promise<unknown> {
    let opening: Promise<void>
    let kept: KeptSession | undefined
    do {
      opening = this.opening
      await opening
      kept = resume === undefined ? undefined : await this.takeKept(resume)
    } while (opening !== this.opening)
    for (const [key, session] of this.sessions) {
      if (session.tabId !== tabId) continue
      // A start that does not go on with the tab's conversation ends it for good.
      if (session.conversation !== undefined && session.conversation !== resume)
        this.forget(session.conversation)
      this.sessions.delete(key)
    }
    const start = this.log.mark()
    if (kept) this.log.touchAll(kept.touched, tabId)
    // Registered at once, so its hooks count while the base is read.
    const session: Session = {
      tabId,
      base: kept ? { tree: kept.base, failed: false, done: Promise.resolve() } : this.takeBase(),
      start,
      prompted: this.log.mark(),
      before: new Map(),
      conversation: resume,
    }
    this.sessions.set(startKey, session)
    session.base?.done.then(
      () => this.persist(session),
      () => undefined,
    )
    this.shownKey = startKey
    this.sendOverlapsIfChanged()
    // The header and the list both follow the view's tab, which now has its session.
    if (this.view.tabId === tabId) this.background(() => this.refresh(true))
    return session.base?.done
  }

  async hook(startKey: string, e: HookInput): Promise<void> {
    try {
      const session = this.sessions.get(startKey)
      const folder = this.folder
      if (!session || folder === null) return
      const store = this.store
      const folderReal = this.folderReal
      if (e.hook_event_name === 'UserPromptSubmit') {
        // The tab saves the conversation it is in at a prompt, so the kept session follows it there.
        if (e.session_id && session.conversation !== e.session_id) {
          if (session.conversation !== undefined) this.forget(session.conversation)
          session.conversation = e.session_id
          this.persist(session)
        }
        if (e.prompt !== undefined && isClaudeCodesOwnPrompt(e.prompt)) return
        // The turn starts now: what Claude touches while its base is read belongs to it. A base that lands
        // after a newer prompt is dropped with this one.
        session.prompted = this.log.mark()
        const turnBase = this.takeBase()
        session.turnBase = turnBase
        if (turnBase) await this.hold(turnBase.done, 'take the turn base', true)
        this.background(() => this.refresh())
      } else if (e.hook_event_name === 'PreToolUse' && e.tool_name === 'Bash' && e.tool_use_id) {
        if (!store) return
        const before = this.snapshot(store)
        session.before.set(e.tool_use_id, before)
        await this.hold(before, 'take the snapshot before a command', false)
      } else if (
        e.hook_event_name === 'PostToolUse' ||
        (e.hook_event_name === 'PostToolUseFailure' && e.tool_name === 'Bash')
      ) {
        if (e.tool_name && EDIT_TOOLS.has(e.tool_name) && e.file_path) {
          for (const path of editedPaths(folder, folderReal, e.file_path)) this.touch(path, session.tabId)
        }
        const before = e.tool_use_id ? session.before.get(e.tool_use_id) : undefined
        if (e.tool_name === 'Bash' && e.tool_use_id) session.before.delete(e.tool_use_id)
        // Queued now, behind the snapshot before the command, which may still be running.
        const after = store && e.tool_name === 'Bash' && before ? this.snapshot(store) : undefined
        this.background(async () => {
          try {
            if (store && before && after) {
              const [from, to] = await Promise.all([before, after])
              const changes = await store.changes(from, to)
              this.log.touchAll(
                changes.map((c) => c.path),
                session.tabId,
              )
              this.persistTab(session.tabId)
              this.sendOverlapsIfChanged()
            }
          } finally {
            await this.refresh()
          }
        })
      } else if (e.hook_event_name === 'Stop') {
        this.background(() => this.refresh())
      }
    } catch (error) {
      this.warn('handle a hook', error)
    }
  }

  /** Drops the tab's session. Its touches stay in the log; nothing of it is kept for a reopen. */
  endSession(tabId: string): void {
    for (const [key, session] of this.sessions) {
      if (session.tabId !== tabId) continue
      if (session.conversation !== undefined) this.forget(session.conversation)
      this.sessions.delete(key)
    }
    if (this.shownKey !== undefined && !this.sessions.has(this.shownKey)) {
      this.shownKey = [...this.sessions.keys()].pop()
    }
    this.sendOverlapsIfChanged()
    this.background(() => this.refresh(true))
  }

  private touch(path: string, tabId: string): void {
    this.log.touch(path, tabId)
    this.persistTab(tabId)
    this.sendOverlapsIfChanged()
  }

  /** The kept session of a resumed conversation, when its base is still in the store. */
  private async takeKept(id: string): Promise<KeptSession | undefined> {
    const kept = this.keptDir === undefined ? undefined : readKept(this.keptDir, id)
    if (!kept || !this.store) return undefined
    try {
      return (await this.store.has(kept.base)) ? kept : undefined
    } catch {
      return undefined
    }
  }

  /** Keeps the session for a reopen: its base and every path it touched. Only a live session is kept. */
  private persist(session: Session): void {
    const tree = session.base?.tree
    if (!this.keptDir || session.conversation === undefined || tree === undefined) return
    if (![...this.sessions.values()].includes(session)) return
    try {
      writeKept(this.keptDir, session.conversation, {
        base: tree,
        touched: this.log.pathsBy(session.tabId, session.start),
      })
    } catch (error) {
      this.warn('keep a session for a reopen', error)
    }
  }

  private persistTab(tabId: string): void {
    for (const session of this.sessions.values()) if (session.tabId === tabId) this.persist(session)
  }

  private forget(conversation: string): void {
    if (!this.keptDir) return
    try {
      forgetKept(this.keptDir, conversation)
    } catch (error) {
      this.warn('forget a kept session', error)
    }
  }

  private sendOverlapsIfChanged(): void {
    const open = [...this.sessions.values()].map((s) => ({ tabId: s.tabId, since: s.start }))
    const overlaps = this.log.overlaps(open)
    const text = JSON.stringify(overlaps)
    if (text === this.lastOverlaps) return
    this.lastOverlaps = text
    this.sendOverlaps(overlaps)
  }

  /** The session the view's tab runs, or else the newest start. */
  private shown(): Session | undefined {
    const tabId = this.view.tabId
    if (tabId !== null) {
      for (const session of this.sessions.values()) if (session.tabId === tabId) return session
    }
    return this.shownKey ? this.sessions.get(this.shownKey) : undefined
  }

  /** Where the shown range starts in the touch log. */
  private rangeStart(session: Session): number {
    return this.view.range === 'turn' ? session.prompted : session.start
  }

  setView(view: ReviewView): void {
    this.view = view
    this.lastSent = undefined
    clearInterval(this.poll)
    this.poll = undefined
    if (view.visible && !this.closed) {
      this.poll = setInterval(() => this.background(() => this.refresh()), this.pollMs)
      this.poll.unref()
    }
    this.background(() => this.refresh(true))
  }

  /**
   * Takes a snapshot and sends the state if it changed. Skips while another snapshot runs. While the shown
   * range's base is read, it says so at once. When Git fails, it sends that the review could not read the
   * Folder, until a later refresh succeeds. A store that could not open is tried again.
   */
  async refresh(force = false): Promise<void> {
    if (this.closed) return
    if (this.unopened) this.reopen()
    if (this.reading()) {
      // A refresh still running from before the base was taken sends nothing.
      await this.publish({ kind: 'waiting', message: READING }, ++this.generation, force)
      return
    }
    // While another snapshot runs, the latest tree is a little old, but the range may have changed.
    const busy = this.store?.busy ?? false
    if (busy && !force) return
    const generation = busy ? this.generation : ++this.generation
    let state: ReviewState
    try {
      if (this.store && !busy) await this.snapshot(this.store)
      state = await this.build(this.latest)
    } catch (error) {
      this.warn('refresh the review', error)
      state = { kind: 'waiting', message: GIT_FAILED }
    }
    await this.publish(state, generation, force)
  }

  async diff(path: string): Promise<FileDiff> {
    try {
      const session = this.shown()
      const base = session && this.baseOf(session)?.tree
      const latest = this.latest
      if (!this.store || !session || !base || !latest) return { kind: 'none' }
      const change = (await this.store.changes(base, latest)).find((c) => c.path === path)
      if (!change) return { kind: 'none' }
      if (change.binary) return { kind: 'binary' }
      const patch = await this.store.diff(base, latest, path)
      return {
        kind: 'text',
        patch,
        byClaude: this.log.by(path, this.rangeStart(session)).length > 0,
      }
    } catch (error) {
      this.warn('read a difference', error)
      return { kind: 'none' }
    }
  }

  close(): void {
    this.closed = true
    clearInterval(this.poll)
    this.poll = undefined
  }

  private baseOf(session: Session): Base | undefined {
    return this.view.range === 'turn' ? session.turnBase : session.base
  }

  /** Whether the shown range's base is still being read. */
  private reading(): boolean {
    const session = this.shown()
    const base = session && this.baseOf(session)
    return base !== undefined && !base.failed && base.tree === undefined
  }

  /** A new base: a snapshot of the Folder now, or, while the store cannot open, one that waits for the next. */
  private takeBase(): Base | undefined {
    const store = this.store
    if (!store) return this.unopened ? { failed: true, done: Promise.resolve() } : undefined
    const done = this.snapshot(store)
    const base: Base = { failed: false, done }
    done.then(
      (tree) => {
        base.tree = tree
      },
      () => {
        base.failed = true
      },
    )
    return base
  }

  /**
   * Takes a snapshot. Snapshots run in order, so one that succeeds is the latest tree of the Folder. It also
   * becomes every base whose own snapshot failed.
   */
  private snapshot(store: SnapshotStore): Promise<string> {
    const epoch = this.folderEpoch
    const taken = store.snapshot()
    taken.then(
      (tree) => {
        if (epoch !== this.folderEpoch) return
        this.latest = tree
        for (const session of this.sessions.values()) {
          for (const base of [session.base, session.turnBase]) {
            if (!base?.failed) continue
            base.failed = false
            base.tree = tree
          }
        }
      },
      () => {},
    )
    return taken
  }

  /**
   * Waits for `work`, but no longer than the wait bound, so a slow Git holds back neither Claude's start nor a
   * hook's reply for long. Work that ends after the wait still counts; with `refreshLate`, the review then
   * refreshes to show it.
   */
  private async hold(work: Promise<unknown>, what: string, refreshLate: boolean): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = new Promise<boolean>((done) => {
      timer = setTimeout(done, this.waitMs, false)
    })
    try {
      if (await Promise.race([work.then(() => true), waited])) return
    } catch (error) {
      this.warn(what, error)
      return
    } finally {
      clearTimeout(timer)
    }
    if (!refreshLate) return
    this.background(async () => {
      try {
        await work
      } catch (error) {
        this.warn(what, error)
      }
      await this.refresh()
    })
  }

  private async build(tree: string | undefined): Promise<ReviewState> {
    if (this.problem) return { kind: 'no-git', message: NO_GIT_MESSAGES[this.problem] }
    if (this.unopened) return { kind: 'waiting', message: GIT_FAILED }
    const session = this.shown()
    if (!this.store || !session || !session.base) return { kind: 'waiting', message: NOT_STARTED }
    const { range } = this.view
    const base = this.baseOf(session)
    if (!base) return { kind: 'waiting', message: NO_PROMPT }
    if (base.failed) return { kind: 'waiting', message: GIT_FAILED }
    if (base.tree === undefined) return { kind: 'waiting', message: READING }
    if (!tree) return { kind: 'waiting', message: NOT_STARTED }
    const changes: Change[] = (await this.store.changes(base.tree, tree)).map((c) => ({
      ...c,
      by: this.log.by(c.path, this.rangeStart(session)),
    }))
    return { kind: 'changes', range, changes }
  }

  private async publish(state: ReviewState, generation: number, force: boolean): Promise<void> {
    if (this.closed || generation !== this.generation) return
    const text = JSON.stringify(state)
    if (!force && text === this.lastSent) return
    this.lastSent = text
    this.send(state)
  }

  private background(task: () => Promise<void>): void {
    task().catch((error: unknown) => this.warn('run background review work', error))
  }

  private warn(what: string, error: unknown): void {
    if (!this.closed) console.warn(`Review could not ${what}:`, error)
  }
}
