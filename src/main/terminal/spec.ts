import { userInfo } from 'node:os'
import type { StartFailure } from '../../shared/api'
import { findExecutable } from './find'

/** What to spawn in a pseudo-terminal. */
export interface SpawnSpec {
  file: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

/** Variables that make Claude Code think it runs inside another Claude Code session. */
const NESTING = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']

export function terminalEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !NESTING.includes(key)) env[key] = value
  }
  env['TERM'] = 'xterm-256color'
  env['COLORTERM'] = 'truecolor'
  return env
}

export function claudeSpec(
  folder: string,
  base: NodeJS.ProcessEnv,
  sessionId: string,
): SpawnSpec | StartFailure {
  const file = findExecutable('claude', base)
  if (!file) {
    return {
      reason: 'not-installed',
      message: 'Claude Code is not installed, or Blueprint cannot find it on your PATH.',
      fix: 'Install it with: curl -fsSL https://claude.ai/install.sh | bash — then press Restart.',
    }
  }
  return { file, args: ['--session-id', sessionId], cwd: folder, env: terminalEnv(base) }
}

export function shellSpec(folder: string, base: NodeJS.ProcessEnv): SpawnSpec {
  const file = base['SHELL'] || userInfo().shell || '/bin/sh'
  return { file, args: [], cwd: folder, env: terminalEnv(base) }
}
