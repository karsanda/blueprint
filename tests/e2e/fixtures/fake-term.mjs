// A stand-in for `claude` and the Developer's shell in e2e tests. It records what it receives
// in $BLUEPRINT_TEST_LOG/<name>.<file>, so tests can check what reached the program.
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const program = basename(process.argv[1])
const log = process.env.BLUEPRINT_TEST_LOG
// Each started fake claude takes the next instance number k, counted in claude.instances. The
// first keeps the stem `claude`; instance k >= 2 uses `claude<k>`, so its logs and files stay apart.
// A claude that exits on its own (the `~` key) hands its number to the next start, which is the
// tab's Restart: a closed tab's number is never reused.
const readLines = (file) => {
  try {
    return readFileSync(join(log, file), 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}
let instance = 0
let name = program
if (program === 'claude') {
  const released = readLines('claude.released')
  const free = released.find((n) => !n.startsWith('taken') && !released.includes(`taken ${n}`))
  if (free) {
    instance = Number(free)
    appendFileSync(join(log, 'claude.released'), `taken ${free}\n`)
  } else {
    appendFileSync(join(log, 'claude.instances'), 'x\n')
    instance = readLines('claude.instances').length
  }
  if (instance > 1) name = `claude${instance}`
}
const isClaude = program === 'claude'
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
    env: { BLUEPRINT_LOGIN_MARK: process.env.BLUEPRINT_LOGIN_MARK, PATH: process.env.PATH },
  }) + '\n',
)
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdout.write(`${program} ready\r\n`)
process.stdout.on('resize', () => out('size', size() + '\n'))

// As `claude`, it reads Blueprint's hook settings once and posts hook events on keys.
const arg = (flag) => {
  const at = process.argv.indexOf(flag)
  return at < 0 ? undefined : process.argv[at + 1]
}
// Claude Code names its transcript after the session id, which is `--session-id`, or else `--resume`.
let sessionId = arg('--session-id') ?? arg('--resume')
let transcript = join(log, `${sessionId}.jsonl`)
if (isClaude) {
  out('sessions', `${sessionId}\n`)
  if (process.argv.includes('--resume')) process.stdout.write(`resumed ${sessionId}\r\n`)
}
const hook = (() => {
  if (!isClaude || !process.argv.includes('--settings')) return null
  const settings = JSON.parse(readFileSync(arg('--settings'), 'utf8'))
  return (event) => settings.hooks[event][0].hooks[0]
})()
const interrupt =
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]},"isSidechain":false,"userType":"external"}'
// Posts run one at a time, in order.
let posting = Promise.resolve()
// Queues work behind earlier posts, so it runs once the post before it has had its reply.
// A failed step is logged to stderr, so it never wedges the queue or reaches the terminal output.
const later = (fn) => {
  posting = posting.then(fn).catch((err) => process.stderr.write(`fake ${name}: ${err}\n`))
}
let writes = 0
let shellCalls = 0
const postNow = (event, extra = {}) => {
  const target = hook(event)
  return fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...target.headers },
    body: JSON.stringify({
      session_id: sessionId,
      transcript_path: transcript,
      cwd: process.cwd(),
      hook_event_name: event,
      ...extra,
    }),
  }).then((res) => out('hooks', `${event} ${res.status}\n`))
}
function post(event, extra) {
  if (hook) later(() => postNow(event, extra))
}
const hookKeys = {
  p: () => {
    // Claude Code writes the prompt to the transcript before the hook runs.
    appendFileSync(transcript, '{"type":"user"}\n')
    post('UserPromptSubmit', { prompt: 'p' })
  },
  '?': () => post('PermissionRequest', { tool_name: 'Bash' }),
  n: () => post('Notification', { notification_type: 'permission_prompt' }),
  t: () => post('PostToolUse'),
  s: () => post('Stop'),
  // Claude ends its turn on a question in plain text.
  Q: () => post('Stop', { last_assistant_message: 'I found two configs.\n\nWhich one should I change?' }),
  // Claude writes a file with its Write tool.
  w: () =>
    later(() => {
      const n = ++writes
      const file = resolve(`${name}-${n}.txt`)
      writeFileSync(file, `written by claude ${n}\n`)
      return postNow('PostToolUse', {
        tool_name: 'Write',
        tool_use_id: `w${n}`,
        tool_input: { file_path: file },
      })
    }),
  // Claude edits notes.txt with its Edit tool.
  e: () =>
    later(async () => {
      const file = resolve('notes.txt')
      // Typed text may hold an `e` in a Folder without notes.txt: that is no edit.
      if (!existsSync(file)) return undefined
      writeFileSync(file, readFileSync(file, 'utf8').replace('notes: first line', 'notes: changed by Claude'))
      await postNow('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: file } })
      return undefined
    }),
  // Claude runs a shell command that makes a file: Blueprint hears it before and after.
  b: () =>
    later(async () => {
      const id = `b${++shellCalls}`
      const input = { command: 'make bash-made.txt' }
      await postNow('PreToolUse', { tool_name: 'Bash', tool_use_id: id, tool_input: input })
      writeFileSync(resolve('bash-made.txt'), 'made by a shell command\n')
      await postNow('PostToolUse', { tool_name: 'Bash', tool_use_id: id, tool_input: input })
    }),
  // Claude Code's own message, as when a background command ends.
  g: () =>
    post('UserPromptSubmit', { prompt: '<task-notification>\n<task-id>b1</task-id>\n</task-notification>' }),
  // Stands in for /clear: Claude Code gives the conversation a new session id and a new transcript.
  // It waits behind earlier posts, so they still carry the old session.
  c: () =>
    later(() => {
      sessionId = randomUUID()
      transcript = join(log, `${sessionId}.jsonl`)
      out('sessions', `${sessionId}\n`)
      out('hooks', 'clear\n')
    }),
  x: () => appendFileSync(transcript, interrupt + '\n'),
  // Focus reporting stays off until a test asks: two tests check the exact bytes typed into the fake.
  r: () => process.stdout.write('\x1b[?1004h'),
}

process.stdin.on('data', (buf) => {
  out('input', buf)
  // Keys typed together may arrive as one chunk: each one still counts.
  for (const k of buf.toString('latin1')) {
    if (k === '~') {
      if (instance > 0) appendFileSync(join(log, 'claude.released'), `${instance}\n`)
      process.exit(3)
    }
    if (isClaude) hookKeys[k]?.()
  }
  const key = buf.length === 1 ? String.fromCharCode(buf[0]) : ''
  if (key === 'f' && program === 'fake-shell') {
    process.stdout.write(`\x1b[?1049h\x1b[2J\x1b[${process.stdout.rows};1HBOTTOM`)
    out('size', size() + '\n')
  }
})
