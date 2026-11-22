import { readFileSync } from 'node:fs'

/**
 * The program that holds the foreground of a shell's terminal, or null when the shell itself does
 * (it sits at its prompt), when there is no foreground group, or when /proc cannot be read.
 * Linux only: the foreground process group is field 8 (`tpgid`) of `/proc/<pid>/stat`.
 */
export function foregroundProgram(
  pid: number,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): string | null {
  try {
    const stat = read(`/proc/${pid}/stat`)
    // The command name in brackets may hold spaces and brackets, so fields count from the last `)`:
    // state, ppid, pgrp, session, tty_nr, tpgid.
    const tpgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[5])
    if (!Number.isInteger(tpgid) || tpgid <= 0 || tpgid === pid) return null
    return read(`/proc/${tpgid}/comm`).trim() || null
  } catch {
    return null
  }
}
