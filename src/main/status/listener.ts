import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { HookInput } from './hooks'

export interface HookListener {
  url: string
  token: string
  close(): Promise<void>
}

const MAX_BODY = 32 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseHookInput(body: string): HookInput | null {
  try {
    const value: unknown = JSON.parse(body)
    if (!isRecord(value)) return null
    const { hook_event_name, session_id, transcript_path, notification_type } = value
    if (typeof hook_event_name !== 'string' || typeof session_id !== 'string') return null
    return {
      hook_event_name,
      session_id,
      ...(typeof transcript_path === 'string' && { transcript_path }),
      ...(typeof notification_type === 'string' && { notification_type }),
    }
  } catch {
    return null
  }
}

function readBody(req: IncomingMessage, res: ServerResponse, onBody: (body: string) => void): void {
  const chunks: Buffer[] = []
  let size = 0
  req.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > MAX_BODY) {
      chunks.length = 0
      req.removeAllListeners('data')
      res.writeHead(413, { Connection: 'close' }).end(() => req.destroy())
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (size <= MAX_BODY) onBody(Buffer.concat(chunks).toString('utf8'))
  })
}

/** Listens on 127.0.0.1 for Claude Code's HTTP hooks. Requests need the bearer token. Replies are always empty. */
export async function startHookListener(onEvent: (e: HookInput) => void): Promise<HookListener> {
  const token = randomBytes(24).toString('hex')
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end()
      return
    }
    if (req.method !== 'POST' || req.url !== '/hook') {
      res.writeHead(404).end()
      return
    }
    readBody(req, res, (body) => {
      res.writeHead(204).end()
      const event = parseHookInput(body)
      if (event) onEvent(event)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Hook listener has no port')
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
