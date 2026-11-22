import { readdirSync, readFileSync } from 'node:fs'

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
