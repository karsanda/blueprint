import { execFile } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** A /proc stat line's fields after the command name, which may hold spaces and brackets: state, ppid, pgrp, session, tty_nr, tpgid… */
function fields(stat: string): string[] {
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')
}

/**
 * The program that holds the foreground of a shell's terminal, or null when the shell itself does
 * (it sits at its prompt), when there is no foreground group, or when /proc cannot be read.
 * Linux only: the foreground process group is field 8 (`tpgid`) of `/proc/<pid>/stat`.
 */
export function foregroundProgram(
  pid: number,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
  list: () => string[] = () => readdirSync('/proc'),
): string | null {
  let tpgid: number
  let session: number
  try {
    const shell = fields(read(`/proc/${pid}/stat`))
    session = Number(shell[3])
    tpgid = Number(shell[5])
  } catch {
    return null
  }
  if (!Number.isInteger(tpgid) || tpgid <= 0 || tpgid === pid) return null
  try {
    return read(`/proc/${tpgid}/comm`).trim() || null
  } catch {
    // The group's leader, the first command of a pipeline such as `cat log | less`, may have ended while
    // the rest still runs. Any process left in the group, in the shell's session, is the program.
  }
  const pids = list()
    .filter((entry) => /^\d+$/.test(entry))
    .map(Number)
    .toSorted((a, b) => a - b)
  for (const member of pids) {
    try {
      const f = fields(read(`/proc/${member}/stat`))
      if (Number(f[2]) === tpgid && Number(f[3]) === session)
        return read(`/proc/${member}/comm`).trim() || null
    } catch {
      // That process ended while the list was read.
    }
  }
  return null
}

/** Lists every process as `pid pgid tpgid comm` lines; it rejects on failure or once its time is up. */
export type PsRunner = () => Promise<string>

/**
 * The program holding the foreground of a shell's terminal, from a `ps -A -o pid=,pgid=,tpgid=,comm=`
 * listing, for macOS, which has no /proc. The shell's own row gives the foreground group; there is none
 * when that is the shell itself, or 0 or less. Otherwise the program is the lowest-numbered process in
 * that group, which also names a pipeline whose first command has ended.
 */
export function foregroundFromPs(pid: number, output: string): string | null {
  const rows = output
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(.+)$/.exec(line))
    .filter((m) => m !== null)
    .map((m) => ({ pid: Number(m[1]), pgid: Number(m[2]), tpgid: Number(m[3]), comm: m[4]?.trim() ?? '' }))
  const tpgid = rows.find((r) => r.pid === pid)?.tpgid
  if (tpgid === undefined || tpgid <= 0 || tpgid === pid) return null
  const member = rows.filter((r) => r.pgid === tpgid).toSorted((a, b) => a.pid - b.pid)[0]
  return member ? basename(member.comm) || null : null
}

const ps: PsRunner = () =>
  new Promise((resolve, reject) => {
    execFile(
      'ps',
      ['-A', '-o', 'pid=,pgid=,tpgid=,comm='],
      { timeout: 2000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    )
  })

/** The macOS check: one `ps` listing, within 2 seconds; a listing that fails names nothing. */
export async function foregroundProgramMac(pid: number, run: PsRunner = ps): Promise<string | null> {
  try {
    return foregroundFromPs(pid, await run())
  } catch {
    return null
  }
}
