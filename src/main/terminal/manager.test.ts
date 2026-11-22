import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { ExitInfo } from '../../shared/api'
import { TerminalManager } from './manager'
import { terminalEnv, type SpawnSpec } from './spec'

let tmp = ''
let manager: TerminalManager
const output = new Map<string, string>()
const exits = new Map<string, ExitInfo[]>()

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'blueprint-pty-'))
  output.clear()
  exits.clear()
  manager = new TerminalManager({
    data: (tabId, data) => output.set(tabId, (output.get(tabId) ?? '') + data),
    exit: (tabId, exit) => exits.set(tabId, [...(exits.get(tabId) ?? []), exit]),
  })
})
afterEach(() => manager.killAll())

function sh(script: string): SpawnSpec {
  return { file: '/bin/sh', args: ['-c', script], cwd: tmp, env: terminalEnv(process.env) }
}

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

function read(name: string): string {
  try {
    return readFileSync(join(tmp, name), 'utf8')
  } catch {
    return ''
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('starts the program in the given folder', async () => {
  manager.start('t', sh('pwd; sleep 5'), 80, 24)
  await expect.poll(() => output.get('t') ?? '', { timeout: 3000 }).toContain(tmp)
})

test('passes written text through exactly', async () => {
  manager.start('t', sh('stty raw -echo; echo ready; head -c 12 > out; sleep 5'), 80, 24)
  await waitFor(() => (output.get('t') ?? '').includes('ready'))
  manager.write('t', 'héllo\tworld')
  await waitFor(() => read('out').length > 0)
  expect(readFileSync(join(tmp, 'out'))).toEqual(Buffer.from('héllo\tworld'))
})

test('resizes the program', async () => {
  manager.start('t', sh('trap "stty size > size" WINCH; echo ready; while :; do sleep 0.1; done'), 80, 24)
  await waitFor(() => (output.get('t') ?? '').includes('ready'))
  manager.resize('t', 100, 30)
  await expect.poll(() => read('size').trim(), { timeout: 3000 }).toBe('30 100')
})

test('a shell runs a command in its foreground until it ends', async () => {
  manager.start('t', { file: '/bin/sh', args: ['-i'], cwd: tmp, env: terminalEnv(process.env) }, 80, 24)
  manager.write('t', 'sleep 5\n')
  await waitFor(() => manager.foreground('t') === 'sleep')
  manager.write('t', '\x03')
  await waitFor(() => manager.foreground('t') === null)
  expect(manager.foreground('none')).toBeNull()
})

test('a pipeline stays in the foreground after its first command ends', async () => {
  manager.start('t', { file: '/bin/sh', args: ['-i'], cwd: tmp, env: terminalEnv(process.env) }, 80, 24)
  manager.write('t', 'true | sleep 5\n')
  await expect.poll(() => manager.foreground('t'), { timeout: 3000 }).toBe('sleep')
})

test('clamps an unknown size', async () => {
  manager.start('t', sh('stty size > size; sleep 5'), 0, Number.NaN)
  await expect.poll(() => read('size').trim(), { timeout: 3000 }).toBe('2 2')
})

test('reports the exit code', async () => {
  manager.start('t', sh('exit 3'), 80, 24)
  await waitFor(() => (exits.get('t') ?? []).length > 0)
  expect(exits.get('t')).toEqual([{ exitCode: 3 }])
})

test('a replaced terminal does not report its exit', async () => {
  manager.start('t', sh('sleep 5'), 80, 24)
  manager.start('t', sh('sleep 0.3; exit 4'), 80, 24)
  await waitFor(() => (exits.get('t') ?? []).length > 0)
  await new Promise((r) => setTimeout(r, 300))
  expect(exits.get('t')).toEqual([{ exitCode: 4 }])
})

test('killAll ends every program', async () => {
  const a = manager.start('a', sh('sleep 30'), 80, 24)
  const b = manager.start('b', sh('sleep 30'), 80, 24)
  manager.killAll()
  await expect.poll(() => alive(a) || alive(b), { timeout: 3000 }).toBe(false)
})
