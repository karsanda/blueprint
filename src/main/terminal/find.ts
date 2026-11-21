import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Finds a program the way a shell would, then in the folders where the Claude Code installers
 * put it. A desktop launcher often starts Blueprint with a PATH that lacks ~/.local/bin.
 */
export function findExecutable(name: string, env: { PATH?: string; HOME?: string }): string | null {
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  if (env.HOME) dirs.push(join(env.HOME, '.local', 'bin'), join(env.HOME, '.claude', 'local'))
  for (const dir of dirs) {
    const path = join(dir, name)
    if (isExecutableFile(path)) return path
  }
  return null
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}
