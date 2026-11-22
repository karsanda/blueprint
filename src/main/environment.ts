import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

/** Runs a program and gives its standard output; it rejects on failure or once the time is up. */
export type Runner = (file: string, args: string[]) => Promise<string>

const LIMIT_MS = 5000
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
/** A shell's own bookkeeping, which says nothing about the Developer's setup. */
const SKIP = new Set(['PWD', 'OLDPWD', 'SHLVL', '_', 'TERM', 'COLUMNS', 'LINES'])

/**
 * Whether Blueprint was started by the desktop (Finder, the Dock, a desktop-menu entry), whose
 * environment is shorter than a terminal's. A terminal always sets TERM; the desktop does not.
 */
export function needsLoginEnvironment(env: NodeJS.ProcessEnv): boolean {
  return !env['TERM']
}

/**
 * The variables `env` printed between two lines holding `marker`, or null without both markers. Lines
 * that are not `NAME=value`, such as the rest of a value that spans lines, are skipped.
 */
export function parseMarkedEnv(output: string, marker: string): Record<string, string> | null {
  const lines = output.split('\n')
  const start = lines.indexOf(marker)
  const end = lines.indexOf(marker, start + 1)
  if (start < 0 || end < 0) return null
  const env: Record<string, string> = {}
  for (const line of lines.slice(start + 1, end)) {
    const at = line.indexOf('=')
    const name = line.slice(0, at)
    if (at > 0 && NAME.test(name)) env[name] = line.slice(at + 1)
  }
  return env
}

/** Blueprint's environment with the login shell's PATH, and every variable it lacked. */
export function mergeEnvironment(
  current: NodeJS.ProcessEnv,
  login: Record<string, string>,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...current }
  for (const [name, value] of Object.entries(login)) {
    if (SKIP.has(name)) continue
    if (name === 'PATH' || merged[name] === undefined) merged[name] = value
  }
  return merged
}

/**
 * Runs the login shell so that nothing in the Developer's rc files can hold Blueprint back:
 * - it reads no input (an rc that asks gets end of file at once);
 * - it runs in a process group of its own, which is killed outright at the limit (an interactive shell
 *   ignores SIGTERM, and a slow command in an rc file would otherwise run on);
 * - the answer is the output so far, once the shell exits or the limit passes, whichever comes first.
 */
export function shellRunner({
  limitMs = LIMIT_MS,
  cwd = homedir(),
  env = process.env,
}: { limitMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}): Runner {
  return (file, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(file, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      const killGroup = (): void => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
        } catch {
          // The group has already gone.
        }
      }
      const timer = setTimeout(() => {
        killGroup()
        reject(new Error(`The login shell took longer than ${limitMs} ms`))
      }, limitMs)
      // Output already written may still be in the pipe when the shell exits: take it once the pipe closes.
      const done = (): void => resolve(output)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('exit', () => {
        clearTimeout(timer)
        // Programs the rc files left behind in the shell's group go with it.
        killGroup()
        child.stdout.once('close', done)
        setTimeout(done, 100)
      })
    })
}

const run: Runner = shellRunner()

/**
 * The Developer's login shell's environment: the shell runs once, interactive and as a login shell, so
 * its profile and rc files run as in a terminal, and prints `env` between two markers. Null when it fails,
 * prints no markers, or takes longer than 5 seconds.
 */
export async function loginEnvironment(
  shell: string,
  runner: Runner = run,
  marker: string = `BLUEPRINT-ENV-${randomUUID()}`,
): Promise<Record<string, string> | null> {
  const script = `printf '\\n%s\\n' '${marker}'; env; printf '%s\\n' '${marker}'`
  try {
    return parseMarkedEnv(await runner(shell, ['-i', '-l', '-c', script]), marker)
  } catch {
    return null
  }
}
