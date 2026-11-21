import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { claudeSpec, shellSpec, terminalEnv } from './spec'

let bin = ''
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'blueprint-spec-'))
})

test('claudeSpec starts claude in the Folder with the session id', () => {
  const claude = join(bin, 'claude')
  writeFileSync(claude, '#!/bin/sh\n')
  chmodSync(claude, 0o755)
  expect(claudeSpec('/work/proj', { PATH: bin, HOME: bin }, 'abc')).toMatchObject({
    file: claude,
    args: ['--session-id', 'abc'],
    cwd: '/work/proj',
  })
})

test('terminalEnv drops the Claude Code nesting variables', () => {
  const env = terminalEnv({ CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', FOO: 'x', GONE: undefined })
  expect(env).toEqual({ FOO: 'x', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
})

test("terminalEnv drops the parent session's markers but keeps Claude Code settings", () => {
  const markers = [
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_CHILD_NOTES_DIR',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_SESSION_ATTENDED',
    'CLAUDE_CODE_BRIDGE_SESSION_ID',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDE_CODE_EXECPATH',
    'CLAUDE_PID',
    'CLAUDE_EFFORT',
    'AI_AGENT',
  ]
  const env = terminalEnv({
    ...Object.fromEntries(markers.map((m) => [m, 'x'])),
    CLAUDE_CODE_USE_BEDROCK: '1',
  })
  expect(env).toEqual({ CLAUDE_CODE_USE_BEDROCK: '1', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
})

test('claudeSpec explains a missing claude', () => {
  expect(claudeSpec('/work/proj', { PATH: bin, HOME: bin }, 'abc')).toEqual({
    reason: 'not-installed',
    message: 'Claude Code is not installed, or Blueprint cannot find it on your PATH.',
    fix: 'Install it with: curl -fsSL https://claude.ai/install.sh | bash — then press Restart.',
  })
})

test('shellSpec uses $SHELL', () => {
  expect(shellSpec('/work/proj', { SHELL: '/usr/bin/fish' })).toMatchObject({
    file: '/usr/bin/fish',
    args: [],
    cwd: '/work/proj',
  })
})

test('shellSpec falls back to the account shell', () => {
  expect(shellSpec('/work/proj', {}).file).toBe(userInfo().shell ?? '/bin/sh')
})
