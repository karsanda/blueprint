import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

function git(repo: string, ...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo },
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
  listed(range: ReviewRange, expected: [string, boolean][]): Promise<[string, boolean][]>
}

async function rig(opts: { start?: boolean; repo?: string } = {}): Promise<Rig> {
  const repo = opts.repo ?? makeRepo()
  const states: ReviewState[] = []
  const svc = new ReviewService(temp('bp-run-'), (s) => states.push(s), {
    pollMs: 50,
  })
  services.push(svc)
  await svc.setFolder(repo)
  if (opts.start !== false) await svc.startSession('claude-1', KEY)
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
    async listed(range, expected) {
      svc.setView({ range, visible: false })
      await vi.waitFor(async () => {
        await svc.refresh()
        const state = states[states.length - 1]
        expect(state?.kind === 'changes' && mark(state.changes)).toEqual(expected)
      })
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
    expect(r.last()).toEqual({
      kind: 'waiting',
      message: 'No prompt yet. Changes show here after your first prompt.',
    })
  })

  it('a Folder outside Git explains that review needs Git, and replies at once', async () => {
    const r = await rig({ repo: temp('bp-plain-'), start: false })
    expect(r.last()).toEqual({
      kind: 'no-git',
      message: 'Review needs Git. This Folder is not a Git repository.',
    })
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
