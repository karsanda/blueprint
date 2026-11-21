import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Change, FileDiff, ReviewState, ReviewView } from '../../shared/api'
import type { HookInput } from '../status/hooks'
import { isClaudeCodesOwnPrompt, pathInFolder, TouchLog } from './attribution'
import { SnapshotStore, type GitProblem } from './git'

const NO_GIT_MESSAGES: Record<GitProblem, string> = {
  'no-git': 'Review needs Git, and Git is not installed.',
  'not-a-repo': 'Review needs Git. This Folder is not a Git repository.',
}
const NOT_STARTED = 'Changes show here once Claude starts.'
const NO_PROMPT = 'No prompt yet. Changes show here after your first prompt.'
const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

/** What Blueprint keeps for one Claude start of a tab, keyed by its start key. */
interface Session {
  tabId: string
  base?: string
  turnBase?: string
  touches: TouchLog
  /** Trees taken before each Bash command, by tool_use_id. */
  before: Map<string, string>
}

/** Keeps each Claude session's review: the snapshots it compares with, who made each Change, and the state to show. */
export class ReviewService {
  private readonly pollMs: number
  private readonly git: string
  private store: SnapshotStore | undefined
  private problem: GitProblem | undefined
  private folder: string | null = null
  private opening: Promise<void> = Promise.resolve()
  private readonly sessions = new Map<string, Session>()
  private shownKey: string | undefined
  private latest: string | undefined
  private view: ReviewView = { range: 'turn', visible: false }
  private poll: ReturnType<typeof setInterval> | undefined
  private lastSent: string | undefined
  private generation = 0
  private closed = false
  /** Counts Folder changes, so work that began under an earlier Folder can tell. */
  private folderEpoch = 0

  constructor(
    private readonly runDir: string,
    private readonly send: (state: ReviewState) => void,
    opts: { pollMs?: number; git?: string } = {},
  ) {
    this.pollMs = opts.pollMs ?? 2000
    this.git = opts.git ?? 'git'
  }

  setFolder(folder: string | null): Promise<void> {
    const open = this.opening.then(() => this.open(folder))
    this.opening = open
    return open
  }

  private async open(folder: string | null): Promise<void> {
    this.folderEpoch++
    this.folder = folder
    this.store = undefined
    this.problem = undefined
    this.latest = undefined
    this.sessions.clear()
    this.shownKey = undefined
    if (folder !== null) {
      try {
        const hash = createHash('sha256').update(folder).digest('hex').slice(0, 16)
        const opened = await SnapshotStore.open(folder, join(this.runDir, hash), this.git)
        if (opened instanceof SnapshotStore) this.store = opened
        else this.problem = opened.problem
      } catch (error) {
        this.warn('open the review store', error)
        this.problem = 'not-a-repo'
      }
    }
    await this.refresh()
  }

  async startSession(tabId: string, startKey: string): Promise<void> {
    try {
      let opening: Promise<void>
      do {
        opening = this.opening
        await opening
      } while (opening !== this.opening)
      const epoch = this.folderEpoch
      for (const [key, session] of this.sessions) {
        if (session.tabId === tabId) this.sessions.delete(key)
      }
      const store = this.store
      const session: Session = {
        tabId,
        touches: new TouchLog(),
        before: new Map(),
      }
      if (store) session.base = await store.snapshot()
      // A Folder change during the snapshot makes this base a tree of the old store.
      if (epoch === this.folderEpoch) {
        this.sessions.set(startKey, session)
        this.shownKey = startKey
      }
    } catch (error) {
      this.warn('take the session base', error)
    }
    await this.refresh()
  }

  async hook(startKey: string, e: HookInput): Promise<void> {
    try {
      const session = this.sessions.get(startKey)
      const store = this.store
      if (!session || !store || !this.folder) return
      const folder = this.folder
      if (e.hook_event_name === 'UserPromptSubmit') {
        if (e.prompt !== undefined && isClaudeCodesOwnPrompt(e.prompt)) return
        session.turnBase = await store.snapshot()
        session.touches.startTurn()
        this.background(() => this.refresh())
      } else if (e.hook_event_name === 'PreToolUse' && e.tool_name === 'Bash' && e.tool_use_id) {
        session.before.set(e.tool_use_id, await store.snapshot())
      } else if (
        e.hook_event_name === 'PostToolUse' ||
        (e.hook_event_name === 'PostToolUseFailure' && e.tool_name === 'Bash')
      ) {
        if (e.tool_name && EDIT_TOOLS.has(e.tool_name) && e.file_path) {
          const path = pathInFolder(folder, e.file_path)
          if (path) session.touches.touch(path)
        }
        const before = e.tool_use_id ? session.before.get(e.tool_use_id) : undefined
        if (e.tool_name === 'Bash' && e.tool_use_id) session.before.delete(e.tool_use_id)
        this.background(async () => {
          if (e.tool_name === 'Bash' && before) {
            const after = await store.snapshot()
            for (const change of await store.changes(before, after)) session.touches.touch(change.path)
          }
          await this.refresh()
        })
      } else if (e.hook_event_name === 'Stop') {
        this.background(() => this.refresh())
      }
    } catch (error) {
      this.warn('handle a hook', error)
    }
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

  /** Takes a snapshot and sends the state if it changed. Skips while another snapshot runs. */
  async refresh(force = false): Promise<void> {
    if (this.closed) return
    try {
      if (this.store?.busy) {
        // The latest tree is a little old, but the range may have changed.
        if (force) await this.publish(await this.build(this.latest), this.generation, true)
        return
      }
      const generation = ++this.generation
      if (this.store) this.latest = await this.store.snapshot()
      await this.publish(await this.build(this.latest), generation, force)
    } catch (error) {
      this.warn('refresh the review', error)
    }
  }

  async diff(path: string): Promise<FileDiff> {
    try {
      const session = this.shownKey ? this.sessions.get(this.shownKey) : undefined
      const base = session && this.baseOf(session)
      if (!this.store || !session || !base || !this.latest) return { kind: 'none' }
      const change = (await this.store.changes(base, this.latest)).find((c) => c.path === path)
      if (!change) return { kind: 'none' }
      if (change.binary) return { kind: 'binary' }
      const patch = await this.store.diff(base, this.latest, path)
      return {
        kind: 'text',
        patch,
        byClaude: session.touches.touched(path, this.view.range),
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

  private baseOf(session: Session): string | undefined {
    return this.view.range === 'turn' ? session.turnBase : session.base
  }

  private async build(tree: string | undefined): Promise<ReviewState> {
    if (this.problem) return { kind: 'no-git', message: NO_GIT_MESSAGES[this.problem] }
    const session = this.shownKey ? this.sessions.get(this.shownKey) : undefined
    if (!this.store || !session || !session.base) return { kind: 'waiting', message: NOT_STARTED }
    const { range } = this.view
    const base = this.baseOf(session)
    if (!base) return { kind: 'waiting', message: NO_PROMPT }
    if (!tree) return { kind: 'waiting', message: NOT_STARTED }
    const changes: Change[] = (await this.store.changes(base, tree)).map((c) => ({
      ...c,
      byClaude: session.touches.touched(c.path, range),
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
