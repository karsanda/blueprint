import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { forgetKept, keptReviewDir, pruneKept, readKept, writeKept } from './kept'

const dirs: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kept-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ID = '674b2b9c-5835-491b-807f-a5479090089a'
const OTHER = '0f1e2d3c-4b5a-4968-8776-655443322110'
const DAY = 24 * 60 * 60 * 1000
const TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const TREE2 = '9bc1dc421dcd51b4ac296e3e5b6e2a99cf44391e'

describe('keptReviewDir', () => {
  it('keptReviewDir puts each Folder in its own dir under review-kept, named as its layout file', () => {
    expect(keptReviewDir('/u', '/home/d/proj')).toBe('/u/review-kept/c3c2cf409d22037d')
  })
})

describe('writeKept and readKept', () => {
  it('a kept session reads back as written', () => {
    const dir = temp()
    writeKept(dir, ID, { base: TREE, touched: ['a.txt', 'src/b.ts'] })
    expect(readKept(dir, ID)).toEqual({ base: TREE, touched: ['a.txt', 'src/b.ts'] })
  })

  it('readKept gives nothing for a conversation it never kept', () => {
    expect(readKept(temp(), ID)).toBeUndefined()
  })

  it('an id that is not a session id is never a file name', () => {
    const dir = temp()
    writeKept(dir, '../escape', { base: TREE, touched: [] })
    expect(existsSync(join(dir, 'escape.json'))).toBe(false)
    expect(existsSync(join(dir, 'sessions'))).toBe(false)
    expect(readKept(dir, '../escape')).toBeUndefined()
  })

  it('readKept ignores a record it cannot trust', () => {
    const dir = temp()
    mkdirSync(join(dir, 'sessions'), { recursive: true })
    writeFileSync(join(dir, 'sessions', `${ID}.json`), '{"base": 7, "touched": "a.txt"}')
    expect(readKept(dir, ID)).toBeUndefined()
  })
})

describe('forgetKept', () => {
  it('forgetKept removes a kept session', () => {
    const dir = temp()
    writeKept(dir, ID, { base: TREE, touched: [] })
    forgetKept(dir, ID)
    expect(readKept(dir, ID)).toBeUndefined()
  })
})

describe('pruneKept', () => {
  it('pruneKept drops sessions untouched for 30 days and keeps the rest', () => {
    const dir = temp()
    writeKept(dir, ID, { base: TREE, touched: [] })
    writeKept(dir, OTHER, { base: TREE2, touched: [] })
    const old = (Date.now() - 31 * DAY) / 1000
    utimesSync(join(dir, 'sessions', `${OTHER}.json`), old, old)
    pruneKept(dir, Date.now())
    expect(readKept(dir, ID)).toBeDefined()
    expect(readKept(dir, OTHER)).toBeUndefined()
  })

  it('pruneKept clears the whole dir once no session is kept', () => {
    const dir = join(temp(), 'folder')
    mkdirSync(join(dir, 'objects'), { recursive: true })
    writeKept(dir, ID, { base: TREE, touched: [] })
    forgetKept(dir, ID)
    pruneKept(dir, Date.now())
    expect(existsSync(dir)).toBe(false)
  })
})
