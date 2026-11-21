import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isInterruptLine, TranscriptFollower } from './transcript'

const toolUse =
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]},"isSidechain":false,"userType":"external"}'
const midTurn =
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]},"isSidechain":false,"userType":"external"}'
const typed = '{"type":"user","message":{"role":"user","content":"[Request interrupted by user]"}}'

describe('isInterruptLine', () => {
  it('recognizes the interrupt lines Claude Code writes', () => {
    expect(isInterruptLine(toolUse)).toBe(true)
    expect(isInterruptLine(midTurn)).toBe(true)
  })

  it('a prompt with the same words is not an interrupt', () => {
    expect(isInterruptLine(typed)).toBe(false)
  })

  it('ignores other lines and broken JSON', () => {
    expect(isInterruptLine('{"type":"assistant","message":{"content":[]}}')).toBe(false)
    expect(isInterruptLine('{')).toBe(false)
    expect(isInterruptLine('')).toBe(false)
  })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('TranscriptFollower', () => {
  let dir: string
  let reports: string[]
  let follower: TranscriptFollower

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blueprint-transcript-'))
    reports = []
    follower = new TranscriptFollower((id) => reports.push(id), 20)
  })
  afterEach(() => {
    follower.unfollowAll()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports interrupts added after following starts', async () => {
    const file = join(dir, 't.jsonl')
    writeFileSync(file, midTurn + '\n')
    follower.follow('s1', file)
    await sleep(100)
    expect(reports).toEqual([])
    appendFileSync(file, toolUse + '\n')
    await expect.poll(() => reports, { timeout: 2000 }).toEqual(['s1'])
  })

  it('follows a file that does not exist yet', async () => {
    const file = join(dir, 'later.jsonl')
    follower.follow('s2', file)
    writeFileSync(file, midTurn + '\n')
    await expect.poll(() => reports, { timeout: 2000 }).toEqual(['s2'])
  })

  it('joins a line written in two parts', async () => {
    const file = join(dir, 'split.jsonl')
    writeFileSync(file, '')
    follower.follow('s3', file)
    const half = Math.floor(toolUse.length / 2)
    appendFileSync(file, toolUse.slice(0, half))
    await sleep(100)
    appendFileSync(file, toolUse.slice(half) + '\n')
    await expect.poll(() => reports, { timeout: 2000 }).toEqual(['s3'])
  })

  it('unfollow stops reports', async () => {
    const file = join(dir, 'stop.jsonl')
    writeFileSync(file, '')
    follower.follow('s4', file)
    follower.unfollow('s4')
    appendFileSync(file, midTurn + '\n')
    await sleep(200)
    expect(reports).toEqual([])
  })
})
