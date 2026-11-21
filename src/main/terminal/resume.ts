import { basename, isAbsolute } from 'node:path'
import type { SavedConversation } from '../../shared/api'

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True only for a Claude Code session id (a UUID), never for text that could pass as a flag. */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value)
}

/**
 * True when a saved conversation may be resumed: a session id, and an absolute transcript path
 * named for it that exists. Does no I/O other than `exists`.
 */
export function resumable(value: unknown, exists: (path: string) => boolean): value is SavedConversation {
  if (typeof value !== 'object' || value === null) return false
  if (!('sessionId' in value) || !('transcript' in value)) return false
  const { sessionId, transcript } = value
  return (
    isSessionId(sessionId) &&
    typeof transcript === 'string' &&
    isAbsolute(transcript) &&
    basename(transcript) === `${sessionId}.jsonl` &&
    exists(transcript)
  )
}
