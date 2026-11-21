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

/**
 * Markers a running Claude Code session puts in its children's environment. They are set only
 * when Blueprint itself starts inside a Claude Code session; passed on, they would make every
 * session and shell in Blueprint look like a child of that one. Claude Code's own settings,
 * such as CLAUDE_CODE_USE_BEDROCK, are kept.
 */
const NESTING = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
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
  settingsFile: string,
): SpawnSpec | StartFailure {
  const file = findExecutable('claude', base)
  if (!file) {
    return {
      reason: 'not-installed',
      message: 'Claude Code is not installed, or Blueprint cannot find it on your PATH.',
      fix: 'Install it with: curl -fsSL https://claude.ai/install.sh | bash — then press Restart.',
    }
  }
  return {
    file,
    args: ['--session-id', sessionId, '--settings', settingsFile],
    cwd: folder,
    env: terminalEnv(base),
  }
}

export function shellSpec(folder: string, base: NodeJS.ProcessEnv): SpawnSpec {
  const file = base['SHELL'] || userInfo().shell || '/bin/sh'
  return { file, args: [], cwd: folder, env: terminalEnv(base) }
}
