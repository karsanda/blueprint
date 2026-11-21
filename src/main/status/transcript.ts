import { closeSync, openSync, readSync, statSync, unwatchFile, watchFile, type Stats } from 'node:fs'

const INTERRUPT_PREFIX = '[Request interrupted by user'

/** True for the transcript line Claude Code appends when the Developer refuses a tool or presses Esc. */
export function isInterruptLine(line: string): boolean {
  let row: unknown
  try {
    row = JSON.parse(line)
  } catch {
    return false
  }
  if (typeof row !== 'object' || row === null) return false
  const { type, message } = row as { type?: unknown; message?: { content?: unknown } }
  if (type !== 'user' || !Array.isArray(message?.content)) return false
  return message.content.some(
    (part: unknown) =>
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      'text' in part &&
      part.type === 'text' &&
      typeof part.text === 'string' &&
      part.text.startsWith(INTERRUPT_PREFIX),
  )
}

interface Followed {
  file: string
  offset: number
  /** Bytes after the last newline, kept for the next read. */
  partial: Buffer
  /** One catch-up read for growth that lands before watchFile takes its baseline. */
  catchUp?: NodeJS.Timeout
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

/** Follows session transcript files and reports each interrupt line appended to them. */
export class TranscriptFollower {
  private readonly followed = new Map<string, Followed>()

  constructor(
    private readonly onInterrupt: (sessionId: string) => void,
    private readonly intervalMs = 300,
  ) {}

  follow(sessionId: string, file: string): void {
    if (this.followed.has(sessionId)) return
    const state: Followed = { file, offset: sizeOf(file), partial: Buffer.alloc(0) }
    this.followed.set(sessionId, state)
    watchFile(file, { interval: this.intervalMs }, (curr: Stats) => this.read(sessionId, state, curr.size))
    state.catchUp = setTimeout(() => this.read(sessionId, state, sizeOf(file)), this.intervalMs)
  }

  unfollow(sessionId: string): void {
    const state = this.followed.get(sessionId)
    if (!state) return
    clearTimeout(state.catchUp)
    unwatchFile(state.file)
    this.followed.delete(sessionId)
  }

  unfollowAll(): void {
    for (const id of this.followed.keys()) this.unfollow(id)
  }

  private read(sessionId: string, state: Followed, size: number): void {
    if (this.followed.get(sessionId) !== state) return
    if (size < state.offset) {
      state.offset = 0
      state.partial = Buffer.alloc(0)
    }
    if (size === state.offset) return
    let chunk: Buffer
    try {
      const fd = openSync(state.file, 'r')
      try {
        chunk = Buffer.alloc(size - state.offset)
        const n = readSync(fd, chunk, 0, chunk.length, state.offset)
        chunk = chunk.subarray(0, n)
      } finally {
        closeSync(fd)
      }
    } catch {
      return
    }
    state.offset += chunk.length
    const data = Buffer.concat([state.partial, chunk])
    const end = data.lastIndexOf(0x0a)
    state.partial = Buffer.from(end < 0 ? data : data.subarray(end + 1))
    if (end < 0) return
    for (const line of data.subarray(0, end).toString('utf8').split('\n')) {
      if (isInterruptLine(line)) this.onInterrupt(sessionId)
    }
  }
}
