import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Change, Overlap, ReviewRange, ReviewState } from '../../shared/api'
import type { HookInput } from '../status/hooks'
import { ReviewService } from './service'

const dirs: string[] = []
const services: ReviewService[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const s of services.splice(0)) s.close()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Runs git for the test's own setup, away from the Developer's global and system config. */
function git(repo: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } },
  )
}

function makeRepo(): string {
  const repo = temp('bp-repo-')
  git(repo, 'init', '-q')
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'first')
  return repo
}

/** How long an `add` of the slow fake git sleeps after it ran. Longer than WAIT_MS, far under KILL_MS. */
const SLOW_MS = 800
const WAIT_MS = 200
const KILL_MS = 5000

interface FakeGit {
  git: string
  /**
   * `hangs`: that many next adds hang. `slow`: every add sleeps SLOW_MS after it ran, so it reads the Folder
   * at once but ends late. `hangOpen`: rev-parse hangs. `lateWrite`: the next add first copies every file
   * of `from` into `to`, dated as `from/.date`, as a git of an earlier run that finishes late would write it.
   */
  set(switches: {
    hangs?: number
    slow?: boolean
    hangOpen?: boolean
    lateWrite?: { from: string; to: string }
  }): void
}

/** A `git` that runs the real git, slowed or hung by its switches. */
function fakeGit(): FakeGit {
  const dir = temp('bp-fake-git-')
  const program = join(dir, 'git')
  writeFileSync(
    program,
    [
      '#!/bin/sh',
      `d='${dir}'`,
      'if [ "$1" = rev-parse ] && [ -e "$d/hang-open" ]; then exec sleep 5; fi',
      'if [ "$1" = add ]; then',
      '  if [ -e "$d/late-write" ]; then',
      '    from=$(sed -n 1p "$d/late-write"); to=$(sed -n 2p "$d/late-write"); rm "$d/late-write"',
      '    for f in "$from"/*; do cp "$f" "$to/" && touch -r "$from/.date" "$to/$(basename "$f")"; done',
      '  fi',
      '  n=$(cat "$d/hangs" 2>/dev/null || echo 0)',
      '  if [ "$n" -gt 0 ]; then echo $((n - 1)) >"$d/hangs"; exec sleep 5; fi',
      `  if [ -e "$d/slow" ]; then git "$@"; s=$?; sleep ${SLOW_MS / 1000}; exit $s; fi`,
      'fi',
      'exec git "$@"',
      '',
    ].join('\n'),
  )
  chmodSync(program, 0o755)
  const flag = (name: string, on: boolean): void => {
    if (on) writeFileSync(join(dir, name), '')
    else rmSync(join(dir, name), { force: true })
  }
  return {
    git: program,
    set({ hangs, slow, hangOpen, lateWrite }) {
      if (lateWrite) writeFileSync(join(dir, 'late-write'), `${lateWrite.from}\n${lateWrite.to}\n`)
      if (hangs !== undefined) writeFileSync(join(dir, 'hangs'), String(hangs))
      if (slow !== undefined) flag('slow', slow)
      if (hangOpen !== undefined) flag('hang-open', hangOpen)
    },
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const READING: ReviewState = { kind: 'waiting', message: 'Review is reading this Folder with Git.' }
const GIT_FAILED: ReviewState = {
  kind: 'waiting',
  message: 'Review could not read this Folder with Git. It tries again shortly.',
}
const NO_PROMPT: ReviewState = {
  kind: 'waiting',
  message: 'No prompt yet. Changes show here after your first prompt.',
}

const KEY = 'k'
const prompt = (extra: Partial<HookInput> = {}): HookInput => ({
  hook_event_name: 'UserPromptSubmit',
  session_id: 's1',
  prompt: 'do it',
  ...extra,
})
const post = (file: string, extra: Record<string, unknown> = {}): HookInput => ({
  hook_event_name: 'PostToolUse',
  session_id: 's1',
  tool_name: 'Write',
  file_path: file,
  ...extra,
})

const mark = (changes: Change[]): [string, string[]][] => changes.map((c) => [c.path, c.by])

interface Rig {
  repo: string
  svc: ReviewService
  states: ReviewState[]
  overlaps: Overlap[][]
  last(): ReviewState
  write(name: string, text?: string): void
  claudeWrites(name: string, text?: string): Promise<void>
  /** Waits for the shown list to be these paths and marks, refreshing as it waits. */
  listed(range: ReviewRange, expected: [string, string[]][], timeout?: number): Promise<[string, string[]][]>
}

interface RigOptions {
  start?: boolean
  repo?: string
  /** The dir that keeps sessions across runs, as for the Blueprint that holds the Folder. */
  kept?: string
  /** The conversation the first session resumes. */
  resume?: string
  git?: string
  waitMs?: number
  timeoutMs?: number
  openTimeoutMs?: number
}

async function rig({ start, repo: given, kept, resume, ...opts }: RigOptions = {}): Promise<Rig> {
  const repo = given ?? makeRepo()
  const states: ReviewState[] = []
  const overlaps: Overlap[][] = []
  const svc = new ReviewService(
    temp('bp-run-'),
    (s) => states.push(s),
    (o) => overlaps.push(o),
    {
      pollMs: 50,
      ...opts,
    },
  )
  services.push(svc)
  await svc.setFolder(repo, kept)
  if (start !== false) await svc.startSession('claude-1', KEY, resume)
  const write = (name: string, text = 'x\n') => writeFileSync(join(repo, name), text)
  return {
    repo,
    svc,
    states,
    overlaps,
    last: () => states[states.length - 1],
    write,
    async claudeWrites(name, text) {
      write(name, text)
      await svc.hook(KEY, post(join(repo, name)))
    },
    async listed(range, expected, timeout) {
      svc.setView({ range, visible: false, tabId: null })
      await vi.waitFor(
        async () => {
          await svc.refresh()
          const state = states[states.length - 1]
          expect(state?.kind === 'changes' && mark(state.changes)).toEqual(expected)
        },
        { timeout },
      )
      const state = states[states.length - 1]
      return state?.kind === 'changes' ? mark(state.changes) : []
    },
  }
}

describe('ReviewService', () => {
  it("This turn lists what changed since the Developer's prompt", async () => {
    const r = await rig()
    r.write('a.txt', 'edited\n')
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('c.txt')
    expect(await r.listed('turn', [['c.txt', ['claude-1']]])).toEqual([['c.txt', ['claude-1']]])
  })

  it('the reply to a prompt comes after the turn base', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('d.txt')
    expect(await r.listed('turn', [['d.txt', []]])).toEqual([['d.txt', []]])
  })

  it("a file Claude's shell command changes is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    const bash = { tool_name: 'Bash', tool_use_id: 't1', session_id: 's1' }
    await r.svc.hook(KEY, { hook_event_name: 'PreToolUse', ...bash })
    r.write('e.txt')
    await r.svc.hook(KEY, { hook_event_name: 'PostToolUse', ...bash })
    expect(await r.listed('turn', [['e.txt', ['claude-1']]])).toEqual([['e.txt', ['claude-1']]])
  })

  it("a file a failing shell command changes is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    const bash = { tool_name: 'Bash', tool_use_id: 't2', session_id: 's1' }
    await r.svc.hook(KEY, { hook_event_name: 'PreToolUse', ...bash })
    r.write('h.txt')
    await r.svc.hook(KEY, { hook_event_name: 'PostToolUseFailure', ...bash })
    expect(await r.listed('turn', [['h.txt', ['claude-1']]])).toEqual([['h.txt', ['claude-1']]])
  })

  it("a subagent's edit is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('g.txt')
    await r.svc.hook(KEY, post(join(r.repo, 'g.txt'), { agent_id: 'sub-1' }))
    expect(await r.listed('turn', [['g.txt', ['claude-1']]])).toEqual([['g.txt', ['claude-1']]])
  })

  it("in a Folder opened through a symlink, an edit named by the real path or the link is Claude's", async () => {
    const repo = makeRepo()
    const link = join(temp('bp-link-'), 'folder')
    symlinkSync(repo, link)
    const r = await rig({ repo: link })
    await r.svc.hook(KEY, prompt())
    r.write('real.txt')
    await r.svc.hook(KEY, post(join(realpathSync(repo), 'real.txt')))
    await r.claudeWrites('link.txt')
    expect(
      await r.listed('turn', [
        ['link.txt', ['claude-1']],
        ['real.txt', ['claude-1']],
      ]),
    ).toEqual([
      ['link.txt', ['claude-1']],
      ['real.txt', ['claude-1']],
    ])
  })

  it('a file changed without a hook is outside Claude', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('f.txt')
    expect(await r.listed('turn', [['f.txt', []]])).toEqual([['f.txt', []]])
  })

  it("Claude Code's own prompts do not start a turn", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'changed\n')
    await r.svc.hook(KEY, prompt({ prompt: '<task-notification>\n<task-id>b1</task-id>' }))
    expect(await r.listed('turn', [['a.txt', ['claude-1']]])).toEqual([['a.txt', ['claude-1']]])
  })

  it('This session lists both turns', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'changed\n')
    await r.svc.hook(KEY, { hook_event_name: 'Stop', session_id: 's1' })
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('b.txt')
    expect(
      await r.listed('session', [
        ['a.txt', ['claude-1']],
        ['b.txt', ['claude-1']],
      ]),
    ).toEqual([
      ['a.txt', ['claude-1']],
      ['b.txt', ['claude-1']],
    ])
    expect(await r.listed('turn', [['b.txt', ['claude-1']]])).toEqual([['b.txt', ['claude-1']]])
  })

  it("a path changed since Claude's turn is outside Claude in the later turn", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.hook(KEY, prompt())
    r.write('a.txt', 'developer\n')
    expect(await r.listed('turn', [['a.txt', []]])).toEqual([['a.txt', []]])
    expect(await r.listed('session', [['a.txt', ['claude-1']]])).toEqual([['a.txt', ['claude-1']]])
  })

  it('a restart starts a new session', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.startSession('claude-1', 'k2')
    expect(await r.listed('session', [])).toEqual([])
    r.write('z.txt')
    await r.svc.hook(KEY, post(join(r.repo, 'z.txt')))
    expect(await r.listed('session', [['z.txt', []]])).toEqual([['z.txt', []]])
  })

  it('/clear keeps the session', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.hook(KEY, prompt({ session_id: 's2' }))
    expect(await r.listed('session', [['a.txt', ['claude-1']]])).toEqual([['a.txt', ['claude-1']]])
  })

  it('before the first prompt, This turn says so', async () => {
    const r = await rig()
    await vi.waitFor(() =>
      expect(r.last()).toEqual({
        kind: 'waiting',
        message: 'No prompt yet. Changes show here after your first prompt.',
      }),
    )
  })

  it('a git slower than the wait bound holds Claude back only up to it, says it is reading, and the review works once the snapshot lands', async () => {
    const fake = fakeGit()
    fake.set({ slow: true })
    const r = await rig({ start: false, git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    let started = Date.now()
    await r.svc.startSession('claude-1', KEY)
    expect(Date.now() - started).toBeGreaterThanOrEqual(WAIT_MS - 5)
    expect(Date.now() - started).toBeLessThan(SLOW_MS)
    // The session shows while its base is still read.
    await vi.waitFor(() => expect(r.last()).toEqual(NO_PROMPT), { timeout: 300 })
    started = Date.now()
    await r.svc.hook(KEY, prompt())
    expect(Date.now() - started).toBeGreaterThanOrEqual(WAIT_MS - 5)
    expect(Date.now() - started).toBeLessThan(SLOW_MS)
    expect(r.last()).toEqual(READING)
    // The snapshots already started stay slow; the rest of the test need not be.
    fake.set({ slow: false })
    await vi.waitFor(() => expect(r.last()).toEqual({ kind: 'changes', range: 'turn', changes: [] }), {
      timeout: 10_000,
    })
    await r.claudeWrites('c.txt')
    expect(await r.listed('turn', [['c.txt', ['claude-1']]], 10_000)).toEqual([['c.txt', ['claude-1']]])
  }, 30_000)

  it("with a git slower than the wait bound, a file Claude's shell command writes is still Claude's", async () => {
    const fake = fakeGit()
    const r = await rig({ start: false, git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    await r.svc.startSession('claude-1', KEY)
    await r.svc.hook(KEY, prompt())
    await vi.waitFor(() => expect(r.last()).toEqual({ kind: 'changes', range: 'turn', changes: [] }))
    // Lets the last refresh's snapshot finish, so Git is idle before it turns slow.
    await sleep(100)
    fake.set({ slow: true })
    const bash = { tool_name: 'Bash', tool_use_id: 't1', session_id: 's1' }
    const started = Date.now()
    await r.svc.hook(KEY, { hook_event_name: 'PreToolUse', ...bash })
    expect(Date.now() - started).toBeGreaterThanOrEqual(WAIT_MS - 5)
    expect(Date.now() - started).toBeLessThan(SLOW_MS)
    // The snapshot before the command has read the Folder, but is still running when the command ends.
    r.write('e.txt')
    fake.set({ slow: false })
    await r.svc.hook(KEY, { hook_event_name: 'PostToolUse', ...bash })
    expect(await r.listed('turn', [['e.txt', ['claude-1']]], 10_000)).toEqual([['e.txt', ['claude-1']]])
  }, 30_000)

  it('what Claude touches while the turn base is still read belongs to the new turn', async () => {
    const fake = fakeGit()
    const r = await rig({ git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    // Lets the session's own snapshots finish before git turns slow.
    await sleep(300)
    fake.set({ slow: true })
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('b.txt')
    fake.set({ slow: false })
    expect(await r.listed('turn', [['b.txt', ['claude-1']]], 10_000)).toEqual([['b.txt', ['claude-1']]])
  }, 30_000)

  it('a late turn base is dropped when a newer Developer prompt arrived', async () => {
    const fake = fakeGit()
    const r = await rig({ git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    await sleep(300)
    fake.set({ slow: true })
    // The first prompt's base reads the Folder at once and lands late.
    await r.svc.hook(KEY, prompt())
    r.write('x.txt')
    // The second prompt's base reads the Folder once the first one lands, x.txt included.
    await r.svc.hook(KEY, prompt())
    fake.set({ slow: false })
    await vi.waitFor(() => expect(r.last()).toEqual({ kind: 'changes', range: 'turn', changes: [] }), {
      timeout: 5000,
    })
    await r.claudeWrites('c.txt')
    expect(await r.listed('turn', [['c.txt', ['claude-1']]], 5000)).toEqual([['c.txt', ['claude-1']]])
  }, 30_000)

  it('a base that lands late lists nothing in reverse while the next snapshot runs', async () => {
    const fake = fakeGit()
    fake.set({ slow: true })
    const r = await rig({ start: false, git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    r.svc.setView({ range: 'session', visible: false, tabId: null })
    // The base waits behind the first refresh's snapshot, which has already read the Folder.
    await r.svc.startSession('claude-1', KEY)
    r.write('f.txt')
    // Once the base lands, a view change lists it against the latest tree while the next snapshot runs.
    await vi.waitFor(
      () => {
        r.svc.setView({ range: 'session', visible: false, tabId: null })
        expect(r.last()).not.toEqual(READING)
      },
      { timeout: 5000, interval: 20 },
    )
    expect(r.last()).toEqual({ kind: 'changes', range: 'session', changes: [] })
  }, 30_000)

  it('a git that hangs past the kill limit says so, and the review recovers, its base taken again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fake = fakeGit()
      // The first refresh's snapshot, the session base and the refresh after it hang.
      fake.set({ hangs: 3 })
      const r = await rig({ start: false, git: fake.git, waitMs: 100, timeoutMs: 400 })
      r.svc.setView({ range: 'session', visible: false, tabId: null })
      const started = Date.now()
      await r.svc.startSession('claude-1', KEY)
      expect(Date.now() - started).toBeLessThan(350)
      await vi.waitFor(() => expect(r.last()).toEqual(READING))
      await vi.waitFor(() => expect(r.last()).toEqual(GIT_FAILED), { timeout: 3000 })
      expect(warn).toHaveBeenCalledWith('Review could not take the session base:', expect.anything())
      // The next snapshot that succeeds, here the next refresh's, becomes the failed base.
      await vi.waitFor(
        async () => {
          await r.svc.refresh()
          expect(r.last()).toEqual({ kind: 'changes', range: 'session', changes: [] })
        },
        { timeout: 3000 },
      )
      await r.svc.hook(KEY, prompt())
      await r.claudeWrites('c.txt')
      expect(await r.listed('session', [['c.txt', ['claude-1']]])).toEqual([['c.txt', ['claude-1']]])
      expect(await r.listed('turn', [['c.txt', ['claude-1']]])).toEqual([['c.txt', ['claude-1']]])
    } finally {
      warn.mockRestore()
    }
  }, 30_000)

  it('a rev-parse that gives no answer says Git could not read the Folder, and opening is tried again until it works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fake = fakeGit()
      fake.set({ hangOpen: true })
      const started = Date.now()
      const r = await rig({ start: false, git: fake.git, openTimeoutMs: 200 })
      expect(Date.now() - started).toBeLessThan(1000)
      await vi.waitFor(() => expect(r.last()).toEqual(GIT_FAILED))
      await r.svc.refresh()
      await sleep(300)
      expect(r.last()).toEqual(GIT_FAILED)
      fake.set({ hangOpen: false })
      await vi.waitFor(
        async () => {
          await r.svc.refresh()
          expect(r.last()).toEqual({ kind: 'waiting', message: 'Changes show here once Claude starts.' })
        },
        { timeout: 3000 },
      )
      await r.svc.startSession('claude-1', KEY)
      await vi.waitFor(() => expect(r.last()).toEqual(NO_PROMPT))
      expect(r.states.some((s) => s.kind === 'no-git')).toBe(false)
    } finally {
      warn.mockRestore()
    }
  }, 30_000)

  it('a Folder outside Git explains that review needs Git, and replies at once', async () => {
    const r = await rig({ repo: temp('bp-plain-'), start: false })
    await vi.waitFor(() =>
      expect(r.last()).toEqual({
        kind: 'no-git',
        message: 'Review needs Git. This Folder is not a Git repository.',
      }),
    )
    await r.svc.startSession('claude-1', KEY)
    await r.svc.hook(KEY, prompt())
  })

  it('polls only while the Changes pane is visible', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.svc.setView({ range: 'turn', visible: true, tabId: null })
    r.write('p.txt')
    await vi.waitFor(
      () =>
        expect(r.last()).toMatchObject({
          kind: 'changes',
          changes: [{ path: 'p.txt' }],
        }),
      { timeout: 1000 },
    )
    r.svc.setView({ range: 'turn', visible: false, tabId: null })
    await new Promise((resolve) => setTimeout(resolve, 100))
    r.write('q.txt')
    await new Promise((resolve) => setTimeout(resolve, 300))
    const state = r.last()
    expect(state.kind === 'changes' && state.changes.map((c) => c.path)).toEqual(['p.txt'])
  })

  it('sends only when the state changes', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.svc.setView({ range: 'turn', visible: true, tabId: null })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const before = r.states.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(r.states.length - before).toBeLessThanOrEqual(1)
  })

  it('each Change names the sessions that made it', async () => {
    const r = await rig()
    await r.svc.startSession('claude-2', 'k2')
    await r.svc.hook(KEY, prompt())
    await r.svc.hook('k2', prompt())
    await r.claudeWrites('a.txt', 'one\n')
    r.write('b.txt')
    await r.svc.hook('k2', post(join(r.repo, 'b.txt')))
    r.svc.setView({ range: 'session', visible: false, tabId: 'claude-1' })
    await vi.waitFor(async () => {
      await r.svc.refresh()
      const state = r.last()
      expect(state.kind === 'changes' && mark(state.changes)).toEqual([
        ['a.txt', ['claude-1']],
        ['b.txt', ['claude-2']],
      ])
    })
  })

  it("the view chooses which session's turn is shown", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'one\n')
    await r.svc.startSession('claude-2', 'k2')
    await r.svc.hook('k2', prompt())
    r.write('b.txt')
    await r.svc.hook('k2', post(join(r.repo, 'b.txt')))
    const shows = async (tabId: string | null, expected: [string, string[]][]) => {
      r.svc.setView({ range: 'turn', visible: false, tabId })
      await vi.waitFor(async () => {
        await r.svc.refresh()
        const state = r.last()
        expect(state.kind === 'changes' && mark(state.changes)).toEqual(expected)
      })
    }
    await shows('claude-1', [
      ['a.txt', ['claude-1']],
      ['b.txt', ['claude-2']],
    ])
    await shows('claude-2', [['b.txt', ['claude-2']]])
    await shows(null, [['b.txt', ['claude-2']]])
    await shows('claude-9', [['b.txt', ['claude-2']]])
  })

  it('two sessions on one file overlap until one ends', async () => {
    const r = await rig()
    await r.svc.startSession('claude-2', 'k2')
    await r.svc.hook(KEY, prompt())
    await r.svc.hook('k2', prompt())
    r.write('notes.txt')
    await r.svc.hook(KEY, post(join(r.repo, 'notes.txt')))
    await r.svc.hook('k2', post(join(r.repo, 'notes.txt')))
    expect(r.overlaps.at(-1)).toEqual([
      { tabId: 'claude-1', others: ['claude-2'], paths: ['notes.txt'] },
      { tabId: 'claude-2', others: ['claude-1'], paths: ['notes.txt'] },
    ])
    r.svc.endSession('claude-2')
    expect(r.overlaps.at(-1)).toEqual([])
  })

  it("an ended session's Changes keep its tab", async () => {
    const r = await rig()
    await r.svc.startSession('claude-2', 'k2')
    await r.svc.hook('k2', prompt())
    r.write('a.txt', 'two sessions\n')
    await r.svc.hook('k2', post(join(r.repo, 'a.txt')))
    r.svc.endSession('claude-2')
    expect(await r.listed('session', [['a.txt', ['claude-2']]])).toEqual([['a.txt', ['claude-2']]])
  })

  it('diff gives the patch, binary or none', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('t.txt', 'needle line\n')
    r.write('bin.dat', 'a\0b\0c')
    expect(
      await r.listed('turn', [
        ['bin.dat', []],
        ['t.txt', ['claude-1']],
      ]),
    ).toEqual([
      ['bin.dat', []],
      ['t.txt', ['claude-1']],
    ])
    expect(await r.svc.diff('t.txt')).toMatchObject({
      kind: 'text',
      byClaude: true,
    })
    const text = await r.svc.diff('t.txt')
    expect(text.kind === 'text' && text.patch).toContain('+needle line')
    expect(await r.svc.diff('bin.dat')).toEqual({ kind: 'binary' })
    expect(await r.svc.diff('a.txt')).toEqual({ kind: 'none' })
  })

  it('a session started while the Folder changes stays off the new Folder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const r = await rig({ start: false })
      const other = makeRepo()
      const started = r.svc.startSession('claude-1', KEY)
      await new Promise((resolve) => setTimeout(resolve, 1))
      const moved = r.svc.setFolder(other)
      await Promise.all([started, moved])
      r.svc.setView({ range: 'session', visible: true, tabId: null })
      await vi.waitFor(() =>
        expect(r.last()).toEqual({ kind: 'waiting', message: 'Changes show here once Claude starts.' }),
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('every view change sends the state, even an unchanged one', async () => {
    const r = await rig()
    const view = { range: 'turn' as const, visible: false, tabId: null }
    r.svc.setView(view)
    await vi.waitFor(() => expect(r.states.length).toBeGreaterThan(0))
    const before = r.states.length
    r.svc.setView(view)
    await vi.waitFor(() => expect(r.states.length).toBeGreaterThan(before))
    const second = r.states.length
    r.svc.setView(view)
    await vi.waitFor(() => expect(r.states.length).toBeGreaterThan(second))
  })
})

describe('ReviewService across a reopen', () => {
  const ID1 = '674b2b9c-5835-491b-807f-a5479090089a'
  const ID2 = '0f1e2d3c-4b5a-4968-8776-655443322110'

  /** One run of Blueprint that holds the Folder: its session talks in conversation ID1 and writes b.txt. */
  async function firstRun(kept: string): Promise<Rig> {
    const r = await rig({ kept })
    await r.svc.hook(KEY, prompt({ session_id: ID1 }))
    await r.claudeWrites('b.txt')
    return r
  }

  it("a resumed session lists This session's Changes from before the reopen, still Claude's", async () => {
    const kept = temp('bp-kept-')
    const first = await firstRun(kept)
    first.svc.close()
    first.write('c.txt')
    const second = await rig({ repo: first.repo, kept, resume: ID1 })
    expect(
      await second.listed('session', [
        ['b.txt', ['claude-1']],
        ['c.txt', []],
      ]),
    ).toEqual([
      ['b.txt', ['claude-1']],
      ['c.txt', []],
    ])
    expect(second.last()).not.toEqual(NO_PROMPT)
    second.svc.setView({ range: 'turn', visible: false, tabId: null })
    await vi.waitFor(() => expect(second.last()).toEqual(NO_PROMPT))
  })

  it('after /clear, the newer conversation keeps the session', async () => {
    const kept = temp('bp-kept-')
    const first = await firstRun(kept)
    await first.svc.hook(KEY, prompt({ session_id: ID2 }))
    await first.claudeWrites('d.txt')
    first.svc.close()
    const second = await rig({ repo: first.repo, kept, resume: ID2 })
    expect(
      await second.listed('session', [
        ['b.txt', ['claude-1']],
        ['d.txt', ['claude-1']],
      ]),
    ).toEqual([
      ['b.txt', ['claude-1']],
      ['d.txt', ['claude-1']],
    ])
  })

  it('a closed tab keeps nothing for the next run', async () => {
    const kept = temp('bp-kept-')
    const first = await firstRun(kept)
    first.svc.endSession('claude-1')
    first.svc.close()
    const second = await rig({ repo: first.repo, kept, resume: ID1 })
    expect(await second.listed('session', [])).toEqual([])
  })

  it('a restart with a new conversation keeps nothing of the old one', async () => {
    const kept = temp('bp-kept-')
    const first = await firstRun(kept)
    await first.svc.startSession('claude-1', 'k2')
    first.svc.close()
    const second = await rig({ repo: first.repo, kept, resume: ID1 })
    expect(await second.listed('session', [])).toEqual([])
  })

  it("an index an earlier run writes late does not break the next run's snapshots", async () => {
    const kept = temp('bp-kept-')
    const first = await firstRun(kept)
    first.svc.endSession('claude-1')
    first.svc.close()
    // The earlier run's index files, dated after the next run starts, so git trusts what they say.
    const saved = temp('bp-saved-')
    for (const name of readdirSync(kept).filter((n) => n.startsWith('index')))
      copyFileSync(join(kept, name), join(saved, name))
    writeFileSync(join(saved, '.date'), '')
    const later = Date.now() / 1000 + 60
    utimesSync(join(saved, '.date'), later, later)
    // The next run wipes the kept store, as nothing is kept, and its first add finds them written back.
    const fake = fakeGit()
    fake.set({ lateWrite: { from: saved, to: kept } })
    const second = await rig({ repo: first.repo, kept, resume: ID1, git: fake.git })
    second.write('e.txt')
    expect(await second.listed('session', [['e.txt', []]])).toEqual([['e.txt', []]])
  })

  it('a Blueprint that does not hold the Folder keeps nothing', async () => {
    const first = await rig()
    await first.svc.hook(KEY, prompt({ session_id: ID1 }))
    await first.claudeWrites('b.txt')
    first.svc.close()
    const kept = temp('bp-kept-')
    const second = await rig({ repo: first.repo, kept, resume: ID1 })
    expect(await second.listed('session', [])).toEqual([])
  })
})
