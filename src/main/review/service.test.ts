import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Change, ReviewRange, ReviewState } from '../../shared/api'
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
   * at once but ends late. `hangOpen`: rev-parse hangs.
   */
  set(switches: { hangs?: number; slow?: boolean; hangOpen?: boolean }): void
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
    set({ hangs, slow, hangOpen }) {
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

const mark = (changes: Change[]): [string, boolean][] => changes.map((c) => [c.path, c.byClaude])

interface Rig {
  repo: string
  svc: ReviewService
  states: ReviewState[]
  last(): ReviewState
  write(name: string, text?: string): void
  claudeWrites(name: string, text?: string): Promise<void>
  /** Waits for the shown list to be these paths and marks, refreshing as it waits. */
  listed(range: ReviewRange, expected: [string, boolean][], timeout?: number): Promise<[string, boolean][]>
}

interface RigOptions {
  start?: boolean
  repo?: string
  git?: string
  waitMs?: number
  timeoutMs?: number
  openTimeoutMs?: number
}

async function rig({ start, repo: given, ...opts }: RigOptions = {}): Promise<Rig> {
  const repo = given ?? makeRepo()
  const states: ReviewState[] = []
  const svc = new ReviewService(temp('bp-run-'), (s) => states.push(s), {
    pollMs: 50,
    ...opts,
  })
  services.push(svc)
  await svc.setFolder(repo)
  if (start !== false) await svc.startSession('claude-1', KEY)
  const write = (name: string, text = 'x\n') => writeFileSync(join(repo, name), text)
  return {
    repo,
    svc,
    states,
    last: () => states[states.length - 1],
    write,
    async claudeWrites(name, text) {
      write(name, text)
      await svc.hook(KEY, post(join(repo, name)))
    },
    async listed(range, expected, timeout) {
      svc.setView({ range, visible: false })
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
    expect(await r.listed('turn', [['c.txt', true]])).toEqual([['c.txt', true]])
  })

  it('the reply to a prompt comes after the turn base', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('d.txt')
    expect(await r.listed('turn', [['d.txt', false]])).toEqual([['d.txt', false]])
  })

  it("a file Claude's shell command changes is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    const bash = { tool_name: 'Bash', tool_use_id: 't1', session_id: 's1' }
    await r.svc.hook(KEY, { hook_event_name: 'PreToolUse', ...bash })
    r.write('e.txt')
    await r.svc.hook(KEY, { hook_event_name: 'PostToolUse', ...bash })
    expect(await r.listed('turn', [['e.txt', true]])).toEqual([['e.txt', true]])
  })

  it("a file a failing shell command changes is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    const bash = { tool_name: 'Bash', tool_use_id: 't2', session_id: 's1' }
    await r.svc.hook(KEY, { hook_event_name: 'PreToolUse', ...bash })
    r.write('h.txt')
    await r.svc.hook(KEY, { hook_event_name: 'PostToolUseFailure', ...bash })
    expect(await r.listed('turn', [['h.txt', true]])).toEqual([['h.txt', true]])
  })

  it("a subagent's edit is Claude's", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('g.txt')
    await r.svc.hook(KEY, post(join(r.repo, 'g.txt'), { agent_id: 'sub-1' }))
    expect(await r.listed('turn', [['g.txt', true]])).toEqual([['g.txt', true]])
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
        ['link.txt', true],
        ['real.txt', true],
      ]),
    ).toEqual([
      ['link.txt', true],
      ['real.txt', true],
    ])
  })

  it('a file changed without a hook is outside Claude', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.write('f.txt')
    expect(await r.listed('turn', [['f.txt', false]])).toEqual([['f.txt', false]])
  })

  it("Claude Code's own prompts do not start a turn", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'changed\n')
    await r.svc.hook(KEY, prompt({ prompt: '<task-notification>\n<task-id>b1</task-id>' }))
    expect(await r.listed('turn', [['a.txt', true]])).toEqual([['a.txt', true]])
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
        ['a.txt', true],
        ['b.txt', true],
      ]),
    ).toEqual([
      ['a.txt', true],
      ['b.txt', true],
    ])
    expect(await r.listed('turn', [['b.txt', true]])).toEqual([['b.txt', true]])
  })

  it("a path changed since Claude's turn is outside Claude in the later turn", async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.hook(KEY, prompt())
    r.write('a.txt', 'developer\n')
    expect(await r.listed('turn', [['a.txt', false]])).toEqual([['a.txt', false]])
    expect(await r.listed('session', [['a.txt', true]])).toEqual([['a.txt', true]])
  })

  it('a restart starts a new session', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.startSession('claude-1', 'k2')
    expect(await r.listed('session', [])).toEqual([])
    r.write('z.txt')
    await r.svc.hook(KEY, post(join(r.repo, 'z.txt')))
    expect(await r.listed('session', [['z.txt', false]])).toEqual([['z.txt', false]])
  })

  it('/clear keeps the session', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('a.txt', 'claude\n')
    await r.svc.hook(KEY, prompt({ session_id: 's2' }))
    expect(await r.listed('session', [['a.txt', true]])).toEqual([['a.txt', true]])
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
    expect(await r.listed('turn', [['c.txt', true]], 10_000)).toEqual([['c.txt', true]])
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
    expect(await r.listed('turn', [['e.txt', true]], 10_000)).toEqual([['e.txt', true]])
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
    expect(await r.listed('turn', [['b.txt', true]], 10_000)).toEqual([['b.txt', true]])
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
    expect(await r.listed('turn', [['c.txt', true]], 5000)).toEqual([['c.txt', true]])
  }, 30_000)

  it('a base that lands late lists nothing in reverse while the next snapshot runs', async () => {
    const fake = fakeGit()
    fake.set({ slow: true })
    const r = await rig({ start: false, git: fake.git, waitMs: WAIT_MS, timeoutMs: KILL_MS })
    r.svc.setView({ range: 'session', visible: false })
    // The base waits behind the first refresh's snapshot, which has already read the Folder.
    await r.svc.startSession('claude-1', KEY)
    r.write('f.txt')
    // Once the base lands, a view change lists it against the latest tree while the next snapshot runs.
    await vi.waitFor(
      () => {
        r.svc.setView({ range: 'session', visible: false })
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
      r.svc.setView({ range: 'session', visible: false })
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
      expect(await r.listed('session', [['c.txt', true]])).toEqual([['c.txt', true]])
      expect(await r.listed('turn', [['c.txt', true]])).toEqual([['c.txt', true]])
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
    r.svc.setView({ range: 'turn', visible: true })
    r.write('p.txt')
    await vi.waitFor(
      () =>
        expect(r.last()).toMatchObject({
          kind: 'changes',
          changes: [{ path: 'p.txt' }],
        }),
      { timeout: 1000 },
    )
    r.svc.setView({ range: 'turn', visible: false })
    await new Promise((resolve) => setTimeout(resolve, 100))
    r.write('q.txt')
    await new Promise((resolve) => setTimeout(resolve, 300))
    const state = r.last()
    expect(state.kind === 'changes' && state.changes.map((c) => c.path)).toEqual(['p.txt'])
  })

  it('sends only when the state changes', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    r.svc.setView({ range: 'turn', visible: true })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const before = r.states.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(r.states.length - before).toBeLessThanOrEqual(1)
  })

  it('diff gives the patch, binary or none', async () => {
    const r = await rig()
    await r.svc.hook(KEY, prompt())
    await r.claudeWrites('t.txt', 'needle line\n')
    r.write('bin.dat', 'a\0b\0c')
    expect(
      await r.listed('turn', [
        ['bin.dat', false],
        ['t.txt', true],
      ]),
    ).toEqual([
      ['bin.dat', false],
      ['t.txt', true],
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
      r.svc.setView({ range: 'session', visible: true })
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
    const view = { range: 'turn' as const, visible: false }
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
