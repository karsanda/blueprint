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
  expect(claudeSpec('/work/proj', { PATH: bin, HOME: bin }, { sessionId: 'abc' }, '/s.json')).toMatchObject({
    file: claude,
    args: ['--session-id', 'abc', '--settings', '/s.json'],
    cwd: '/work/proj',
  })
})

test('a resumed start passes --resume and no --session-id', () => {
  const claude = join(bin, 'claude')
  writeFileSync(claude, '#!/bin/sh\n')
  chmodSync(claude, 0o755)
  const ID = 'fb8023a7-89b0-439e-9c07-2d3254e55395'
  const spec = claudeSpec('/work/proj', { PATH: bin, HOME: bin }, { resume: ID }, '/s.json')
  expect(spec).toMatchObject({ args: ['--resume', ID, '--settings', '/s.json'] })
})

test('terminalEnv drops the Claude Code nesting variables', () => {
  const env = terminalEnv(
    { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', FOO: 'x', GONE: undefined },
    'linux',
  )
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
  const env = terminalEnv(
    {
      ...Object.fromEntries(markers.map((m) => [m, 'x'])),
      CLAUDE_CODE_USE_BEDROCK: '1',
    },
    'linux',
  )
  expect(env).toEqual({ CLAUDE_CODE_USE_BEDROCK: '1', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
})

test('claudeSpec explains a missing claude', () => {
  expect(claudeSpec('/work/proj', { PATH: bin, HOME: bin }, { sessionId: 'abc' }, '/s.json')).toEqual({
    reason: 'not-installed',
    message: 'Claude Code is not installed, or Blueprint cannot find it on your PATH.',
    fix: 'Install it with: curl -fsSL https://claude.ai/install.sh | bash — then press Restart.',
  })
})

test('shellSpec uses $SHELL', () => {
  expect(shellSpec('/work/proj', { SHELL: '/usr/bin/fish' }, 'linux')).toMatchObject({
    file: '/usr/bin/fish',
    args: [],
    cwd: '/work/proj',
  })
})

test('shellSpec falls back to the account shell', () => {
  expect(shellSpec('/work/proj', {}).file).toBe(userInfo().shell ?? '/bin/sh')
})

test('shells start as login shells on macOS only', () => {
  expect(shellSpec('/work/proj', { SHELL: '/bin/zsh' }, 'darwin').args).toEqual(['-l'])
  expect(shellSpec('/work/proj', { SHELL: '/bin/zsh' }, 'linux').args).toEqual([])
})

test('a macOS Blueprint opened from Finder gives its terminals a UTF-8 locale', () => {
  expect(terminalEnv({}, 'darwin', 'pt-BR')['LANG']).toBe('pt_BR.UTF-8')
  expect(terminalEnv({}, 'darwin', 'en')['LANG']).toBe('en_US.UTF-8')
  // A locale the Developer set is theirs.
  expect(terminalEnv({ LC_ALL: 'C' }, 'darwin', 'pt-BR')['LANG']).toBeUndefined()
  expect(terminalEnv({ LANG: 'de_DE.UTF-8' }, 'darwin', 'pt-BR')['LANG']).toBe('de_DE.UTF-8')
  // Ubuntu's desktop always gives one.
  expect(terminalEnv({}, 'linux', 'pt-BR')['LANG']).toBeUndefined()
})
