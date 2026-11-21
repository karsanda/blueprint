import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FolderState } from '../shared/api'

/**
 * Reads the Folder from the command line. Flags are skipped. When Blueprint is not packaged,
 * the first other argument is the app entry that was passed to Electron, so it is skipped too.
 */
export function resolveFolder(argv: string[], opts: { packaged: boolean; cwd: string }): FolderState {
  const positional = argv.slice(1).filter((a) => !a.startsWith('-'))
  const arg = (opts.packaged ? positional : positional.slice(1))[0]
  if (arg === undefined) return { folder: null }
  const path = resolve(opts.cwd, arg)
  return isDirectory(path) ? { folder: path } : { folder: null, problem: `Not a folder: ${path}` }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
