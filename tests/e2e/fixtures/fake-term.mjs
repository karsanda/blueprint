// A stand-in for `claude` and the Developer's shell in e2e tests. It records what it receives
// in $BLUEPRINT_TEST_LOG/<name>.<file>, so tests can check what reached the program.
import { appendFileSync } from 'node:fs'
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

process.stdin.on('data', (buf) => {
  out('input', buf)
  const key = buf.length === 1 ? String.fromCharCode(buf[0]) : ''
  if (key === '~') process.exit(3)
  if (key === 'f' && name === 'fake-shell') {
    process.stdout.write(`\x1b[?1049h\x1b[2J\x1b[${process.stdout.rows};1HBOTTOM`)
    out('size', size() + '\n')
  }
})
