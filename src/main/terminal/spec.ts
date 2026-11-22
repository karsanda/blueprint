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

export function terminalEnv(
  base: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  locale: string = Intl.DateTimeFormat().resolvedOptions().locale,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !NESTING.includes(key)) env[key] = value
  }
  env['TERM'] = 'xterm-256color'
  env['COLORTERM'] = 'truecolor'
  // A macOS app opened from Finder gets no locale (Terminal.app sets one itself), and shells would then
  // show non-ASCII text as escapes. One the Developer set always wins.
  if (platform === 'darwin' && !env['LANG'] && !env['LC_ALL'] && !env['LC_CTYPE'])
    env['LANG'] = utf8Locale(locale)
  return env
}

/** A UTF-8 locale for a BCP 47 tag: `pt-BR` gives `pt_BR.UTF-8`; a tag without a region gives `en_US.UTF-8`. */
function utf8Locale(tag: string): string {
  const [language, region] = tag.split('-')
  return language && region && /^[A-Z]{2}$/.test(region) ? `${language}_${region}.UTF-8` : 'en_US.UTF-8'
}

export function claudeSpec(
  folder: string,
  base: NodeJS.ProcessEnv,
  start: { sessionId: string } | { resume: string },
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
    args: [
      'sessionId' in start ? '--session-id' : '--resume',
      'sessionId' in start ? start.sessionId : start.resume,
      '--settings',
      settingsFile,
    ],
    cwd: folder,
    env: terminalEnv(base),
  }
}

export function shellSpec(
  folder: string,
  base: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): SpawnSpec {
  const file = base['SHELL'] || userInfo().shell || '/bin/sh'
  // On macOS shells start as login shells, as Terminal.app starts them, so ~/.zprofile runs (Homebrew's PATH).
  return { file, args: platform === 'darwin' ? ['-l'] : [], cwd: folder, env: terminalEnv(base) }
}
