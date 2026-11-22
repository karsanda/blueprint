import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { folderKey } from '../layout/store'
import { isSessionId } from '../terminal/resume'

/** What Blueprint keeps of one conversation's review across a reopen. */
export interface KeptSession {
  /** The tree of the session base, in the kept store's objects. */
  base: string
  /** Every path the session touched since its start. */
  touched: string[]
}

/** A kept session nobody resumed or touched for this long is dropped. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The dir that keeps a Folder's review across runs: `<userData>/review-kept/<folderKey>`. It holds the
 * snapshot store and `sessions/<conversation id>.json`. Only the Blueprint that holds the Folder uses it.
 */
export function keptReviewDir(userData: string, folder: string): string {
  return join(userData, 'review-kept', folderKey(folder))
}

/** The record of a conversation, or null for an id that is not a session id and so never names a file. */
function recordFile(dir: string, id: string): string | null {
  return isSessionId(id) ? join(dir, 'sessions', `${id}.json`) : null
}

export function writeKept(dir: string, id: string, session: KeptSession): void {
  const file = recordFile(dir, id)
  if (!file) return
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(session))
  renameSync(temp, file)
}

export function readKept(dir: string, id: string): KeptSession | undefined {
  const file = recordFile(dir, id)
  if (!file) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    if (!('base' in parsed) || !('touched' in parsed)) return undefined
    const { base, touched } = parsed
    if (typeof base !== 'string' || !/^[0-9a-f]{40,64}$/.test(base)) return undefined
    if (!Array.isArray(touched) || !touched.every((p) => typeof p === 'string')) return undefined
    return { base, touched }
  } catch {
    return undefined
  }
}

export function forgetKept(dir: string, id: string): void {
  const file = recordFile(dir, id)
  if (file) rmSync(file, { force: true })
}

/**
 * Drops kept sessions untouched for 30 days: a conversation whose tab is gone is never resumed. When no
 * session is left, the whole dir goes, so its snapshot store starts afresh instead of growing. What cannot
 * go stays, such as objects a git of an earlier run still writes: no kept session needs them, and each run
 * starts a fresh index of its own.
 */
export function pruneKept(dir: string, now: number): void {
  const sessions = join(dir, 'sessions')
  let names: string[] = []
  try {
    names = readdirSync(sessions)
  } catch {
    // No sessions dir: nothing is kept.
  }
  let left = 0
  for (const name of names) {
    const file = join(sessions, name)
    try {
      if (name.endsWith('.json') && now - statSync(file).mtimeMs <= MAX_AGE_MS) {
        left++
        continue
      }
    } catch {
      // A record that vanished meanwhile counts as gone.
    }
    rmSync(file, { force: true })
  }
  if (left > 0) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Left for a later prune.
  }
}
