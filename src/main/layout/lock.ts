import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { folderKey } from './store'

function errorCode(err: unknown): unknown {
  return err instanceof Error && 'code' in err ? err.code : undefined
}

/** The file that says which Blueprint holds a Folder: `<userData>/locks/<folderKey>.lock`, holding its pid. */
export function lockFile(userData: string, folder: string): string {
  return join(userData, 'locks', `${folderKey(folder)}.lock`)
}

/** The pid a lock file names, or null when it is missing or names none. */
function holder(file: string): number | null {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/**
 * Takes the Folder for the Blueprint with `pid`, unless another one that is still `alive` holds it.
 * Returns whether this Blueprint holds it now. The file is made only if it does not exist, so two
 * Blueprints opening the Folder at once cannot both take it.
 */
export function claimFolder(file: string, pid: number, alive: (pid: number) => boolean): boolean {
  mkdirSync(dirname(file), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, `${pid}\n`, { flag: 'wx' })
      return true
    } catch (err) {
      if (errorCode(err) !== 'EEXIST') throw err
    }
    const other = holder(file)
    if (other === pid) return true
    if (other !== null && alive(other)) return false
    // The Blueprint that held it has ended, or the file names no process: clear it and try once more.
    rmSync(file, { force: true })
  }
  return false
}

/**
 * Takes the Folder for this Blueprint, as `claimFolder` does. When the lock cannot be written at all, this
 * Blueprint acts as the holder, as Blueprint did before there were locks.
 */
export function holdFolder(userData: string, folder: string): boolean {
  try {
    return claimFolder(lockFile(userData, folder), process.pid, processAlive)
  } catch (err) {
    console.warn('Blueprint could not lock the Folder:', err)
    return true
  }
}

/** Gives the Folder up, if this Blueprint holds it. */
export function releaseFolder(file: string, pid: number): void {
  if (holder(file) === pid) rmSync(file, { force: true })
}

/** Whether a process runs: signal 0 checks without sending anything. EPERM means it runs as someone else. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return errorCode(err) === 'EPERM'
  }
}
