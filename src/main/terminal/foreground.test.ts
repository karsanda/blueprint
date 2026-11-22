import { describe, expect, it } from 'vitest'
import { foregroundFromPs, foregroundProgram, foregroundProgramMac } from './foreground'

/** A `read` that serves these files and fails for any other path, as a missing /proc entry does. */
function files(map: Record<string, string>): (path: string) => string {
  return (path) => {
    const text = map[path]
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return text
  }
}

describe('foregroundProgram', () => {
  it('a shell at its prompt runs nothing in its foreground', () => {
    const read = files({ '/proc/100/stat': '100 (zsh) S 1 100 100 34816 100 4194560' })
    expect(foregroundProgram(100, read)).toBeNull()
  })

  it('a program in the foreground is named', () => {
    const read = files({
      '/proc/100/stat': '100 (zsh) S 1 100 100 34816 205 4194560',
      '/proc/205/comm': 'vim\n',
    })
    expect(foregroundProgram(100, read)).toBe('vim')
  })

  it('a command name with spaces and brackets still parses', () => {
    const read = files({
      '/proc/100/stat': '100 (my (odd) sh) S 1 100 100 34816 205 0',
      '/proc/205/comm': 'sleep\n',
    })
    expect(foregroundProgram(100, read)).toBe('sleep')
  })

  it('a terminal with no foreground group runs nothing', () => {
    const read = files({ '/proc/100/stat': '100 (zsh) S 1 100 100 34816 -1 4194560' })
    expect(foregroundProgram(100, read)).toBeNull()
  })

  it('a process that cannot be read runs nothing', () => {
    expect(foregroundProgram(100, files({}))).toBeNull()
    const noComm = files({ '/proc/100/stat': '100 (zsh) S 1 100 100 34816 205 4194560' })
    expect(foregroundProgram(100, noComm)).toBeNull()
  })

  it('a pipeline whose first command ended names a program still in its group', () => {
    const read = files({
      '/proc/100/stat': '100 (zsh) S 1 100 100 34816 205 4194560',
      // 205 led the group and has ended; 206 is still in group 205, in the shell's session 100.
      '/proc/206/stat': '206 (less) S 100 205 100 34816 205 0',
      '/proc/206/comm': 'less\n',
      '/proc/207/stat': '207 (less) S 1 205 300 0 -1 0',
      '/proc/207/comm': 'other\n',
    })
    expect(foregroundProgram(100, read, () => ['1', '100', '207', '206', 'self'])).toBe('less')
  })

  it('a foreground group with no process left runs nothing', () => {
    const read = files({ '/proc/100/stat': '100 (zsh) S 1 100 100 34816 205 4194560' })
    expect(foregroundProgram(100, read, () => ['1', '100'])).toBeNull()
  })
})

/** A `ps -A -o pid=,pgid=,tpgid=,comm=` listing of these rows. */
const ps = (...rows: [number, number, number, string][]) =>
  rows
    .map(
      ([pid, pgid, tpgid, comm]) =>
        `${String(pid).padStart(5)} ${String(pgid).padStart(5)} ${String(tpgid).padStart(5)} ${comm}`,
    )
    .join('\n')

describe('foregroundFromPs', () => {
  it('ps: a shell at its prompt runs nothing', () => {
    expect(foregroundFromPs(100, ps([100, 100, 100, '/bin/zsh'], [7, 7, -1, '/sbin/launchd']))).toBeNull()
  })

  it('ps: the program in the foreground group is named', () => {
    expect(foregroundFromPs(100, ps([100, 100, 205, '-zsh'], [205, 205, 205, '/usr/bin/vim']))).toBe('vim')
  })

  it('ps: a pipeline whose leader ended names the next member', () => {
    const output = ps(
      [100, 100, 205, '/bin/zsh'],
      [207, 205, 205, '/usr/bin/sort'],
      [206, 205, 205, '/usr/bin/less'],
    )
    expect(foregroundFromPs(100, output)).toBe('less')
  })

  it('ps: a name with spaces is kept whole', () => {
    const output = ps(
      [100, 100, 205, '/bin/zsh'],
      [205, 205, 205, '/Applications/Some App.app/Contents/MacOS/Some App'],
    )
    expect(foregroundFromPs(100, output)).toBe('Some App')
  })

  it('ps: no row for the shell, or no foreground group, runs nothing', () => {
    expect(foregroundFromPs(100, ps([205, 205, 205, '/usr/bin/vim']))).toBeNull()
    expect(foregroundFromPs(100, ps([100, 100, 0, '/bin/zsh']))).toBeNull()
    expect(foregroundFromPs(100, ps([100, 100, -1, '/bin/zsh']))).toBeNull()
    expect(foregroundFromPs(100, ps([100, 100, 205, '/bin/zsh']))).toBeNull()
  })

  it('ps: a listing that fails runs nothing', async () => {
    expect(await foregroundProgramMac(100, () => Promise.reject(new Error('timed out')))).toBeNull()
  })
})
