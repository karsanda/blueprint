import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claimFolder, lockFile, releaseFolder } from './lock'

const dirs: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lock-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A lock file another Blueprint wrote. */
function heldBy(file: string, pid: number | string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${pid}\n`)
}

const alive = (pids: number[]) => (pid: number) => pids.includes(pid)

describe('lockFile', () => {
  it('lockFile puts each Folder in its own file under locks, named as its layout file', () => {
    expect(lockFile('/u', '/home/d/proj')).toBe('/u/locks/c3c2cf409d22037d.lock')
    expect(lockFile('/u', '/home/d/other')).not.toBe(lockFile('/u', '/home/d/proj'))
  })
})

describe('claimFolder', () => {
  it('claimFolder takes a Folder no Blueprint holds', () => {
    const file = lockFile(temp(), '/home/d/proj')
    expect(claimFolder(file, 100, alive([100]))).toBe(true)
    expect(readFileSync(file, 'utf8').trim()).toBe('100')
  })

  it('claimFolder leaves a Folder another running Blueprint holds', () => {
    const file = lockFile(temp(), '/home/d/proj')
    heldBy(file, 200)
    expect(claimFolder(file, 100, alive([100, 200]))).toBe(false)
    expect(readFileSync(file, 'utf8').trim()).toBe('200')
  })

  it('claimFolder takes over a Folder whose Blueprint has ended', () => {
    const file = lockFile(temp(), '/home/d/proj')
    heldBy(file, 200)
    expect(claimFolder(file, 100, alive([100]))).toBe(true)
    expect(readFileSync(file, 'utf8').trim()).toBe('100')
  })

  it('claimFolder keeps a Folder this Blueprint already holds', () => {
    const file = lockFile(temp(), '/home/d/proj')
    heldBy(file, 100)
    expect(claimFolder(file, 100, alive([100]))).toBe(true)
  })

  it('claimFolder takes a lock file that names no process', () => {
    const file = lockFile(temp(), '/home/d/proj')
    heldBy(file, 'not a pid')
    expect(claimFolder(file, 100, alive([100]))).toBe(true)
    expect(readFileSync(file, 'utf8').trim()).toBe('100')
  })
})

describe('releaseFolder', () => {
  it('releaseFolder removes the lock this Blueprint holds', () => {
    const file = lockFile(temp(), '/home/d/proj')
    claimFolder(file, 100, alive([100]))
    releaseFolder(file, 100)
    expect(existsSync(file)).toBe(false)
  })

  it("releaseFolder leaves another Blueprint's lock alone", () => {
    const file = lockFile(temp(), '/home/d/proj')
    heldBy(file, 200)
    releaseFolder(file, 100)
    expect(readFileSync(file, 'utf8').trim()).toBe('200')
  })
})
