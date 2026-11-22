import { join, resolve } from 'node:path'

/**
 * Whether this start should hand over to a detached copy of itself: a packaged Blueprint started from a
 * terminal (`blueprint <folder>`), so the prompt comes back and closing the terminal ends neither
 * Blueprint nor its Claude sessions. The copy carries BLUEPRINT_DETACHED, so it never detaches again.
 */
export function shouldDetach(o: { packaged: boolean; stdinIsTTY: boolean; env: NodeJS.ProcessEnv }): boolean {
  return o.packaged && o.stdinIsTTY && !o.env['BLUEPRINT_DETACHED']
}

/** The detached copy's arguments: this start's, with the Folder made absolute, since the copy may start elsewhere. */
export function detachedArgs(argv: string[], cwd: string): string[] {
  const args = argv.slice(1)
  const at = args.findIndex((a) => !a.startsWith('-'))
  return at < 0 ? args : args.map((a, i) => (i === at ? resolve(cwd, a) : a))
}

/**
 * Where `pnpm dev` keeps its settings, apart from the installed app's: on macOS, which ignores letter case
 * in paths, `blueprint` and `Blueprint` would be one folder. Null for a packaged app and for e2e runs,
 * which are named Electron.
 */
export function devUserData(o: { packaged: boolean; name: string; appData: string }): string | null {
  return !o.packaged && o.name.toLowerCase() === 'blueprint' ? join(o.appData, 'blueprint-dev') : null
}
