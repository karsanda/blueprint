import { describe, expect, it } from 'vitest'
import { foregroundProgram } from './foreground'

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
