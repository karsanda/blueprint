// A stand-in for `claude` and the Developer's shell in e2e tests. It records what it receives
// in $BLUEPRINT_TEST_LOG/<name>.<file>, so tests can check what reached the program.
import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const name = basename(process.argv[1])
const log = process.env.BLUEPRINT_TEST_LOG
const out = (file, data) => appendFileSync(join(log, `${name}.${file}`), data)
const size = () => `${process.stdout.columns}x${process.stdout.rows}`

out(
  'start',
  JSON.stringify({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    pid: process.pid,
    cols: process.stdout.columns,
    rows: process.stdout.rows,
  }) + '\n',
)
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdout.write(`${name} ready\r\n`)
process.stdout.on('resize', () => out('size', size() + '\n'))

// As `claude`, it reads Blueprint's hook settings once and posts hook events on keys.
const arg = (flag) => process.argv[process.argv.indexOf(flag) + 1]
let sessionId = arg('--session-id')
let transcript = join(log, 'claude.transcript.jsonl')
let clears = 0
const hook = (() => {
  if (name !== 'claude' || !process.argv.includes('--settings')) return null
  const settings = JSON.parse(readFileSync(arg('--settings'), 'utf8'))
  return (event) => settings.hooks[event][0].hooks[0]
})()
const interrupt =
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]},"isSidechain":false,"userType":"external"}'
// Posts run one at a time, in order.
let posting = Promise.resolve()
function post(event, extra = {}) {
  if (!hook) return
  const target = hook(event)
  posting = posting.then(async () => {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...target.headers },
      body: JSON.stringify({
        session_id: sessionId,
        transcript_path: transcript,
        cwd: process.cwd(),
        hook_event_name: event,
        ...extra,
      }),
    })
    out('hooks', `${event} ${res.status}\n`)
  })
}
const hookKeys = {
  p: () => post('UserPromptSubmit', { prompt: 'p' }),
  '?': () => post('PermissionRequest', { tool_name: 'Bash' }),
  n: () => post('Notification', { notification_type: 'permission_prompt' }),
  t: () => post('PostToolUse'),
  s: () => post('Stop'),
  // Stands in for /clear: Claude Code gives the conversation a new session id and a new transcript.
  c: () => {
    sessionId = randomUUID()
    transcript = join(log, `claude.transcript-${++clears}.jsonl`)
    out('hooks', 'clear\n')
  },
  x: () => appendFileSync(transcript, interrupt + '\n'),
  // Focus reporting stays off until a test asks: two tests check the exact bytes typed into the fake.
  r: () => process.stdout.write('\x1b[?1004h'),
}

process.stdin.on('data', (buf) => {
  out('input', buf)
  const key = buf.length === 1 ? String.fromCharCode(buf[0]) : ''
  if (key === '~') process.exit(3)
  if (name === 'claude') hookKeys[key]?.()
  if (key === 'f' && name === 'fake-shell') {
    process.stdout.write(`\x1b[?1049h\x1b[2J\x1b[${process.stdout.rows};1HBOTTOM`)
    out('size', size() + '\n')
  }
})
