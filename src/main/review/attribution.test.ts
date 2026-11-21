import { describe, expect, it } from 'vitest'
import { isClaudeCodesOwnPrompt, pathInFolder, TouchLog } from './attribution'

describe('attribution', () => {
  it("recognizes Claude Code's own prompts", () => {
    expect(isClaudeCodesOwnPrompt('<task-notification>\n<task-id>b1</task-id>')).toBe(true)
    expect(isClaudeCodesOwnPrompt('<agent-message from="a87f">\n[Subagent hand-back]')).toBe(true)
    expect(isClaudeCodesOwnPrompt('fix the bug')).toBe(false)
    expect(isClaudeCodesOwnPrompt(' <task-notification>')).toBe(false)
    expect(isClaudeCodesOwnPrompt('read <agent-message')).toBe(false)
  })

  it('pathInFolder keeps paths inside the Folder', () => {
    expect(pathInFolder('/f', '/f/a/b.txt')).toBe('a/b.txt')
    expect(pathInFolder('/f', 'a.txt')).toBe('a.txt')
    expect(pathInFolder('/f', '/f')).toBeNull()
    expect(pathInFolder('/f', '/g/x')).toBeNull()
    expect(pathInFolder('/f', '/f/../g/x')).toBeNull()
  })

  it('by names every session that touched a path after the mark, in first-touch order', () => {
    const log = new TouchLog()
    log.touch('a', 'B')
    log.touch('a', 'A')
    log.touch('a', 'B')
    expect(log.by('a', 0)).toEqual(['B', 'A'])
    expect(log.by('other', 0)).toEqual([])
  })

  it('a touch before the mark does not count', () => {
    const log = new TouchLog()
    log.touch('a', 'A')
    const mark = log.mark()
    log.touch('a', 'B')
    expect(log.by('a', mark)).toEqual(['B'])
    expect(log.by('a', log.mark())).toEqual([])
  })

  it('overlaps pairs sessions on the paths both touched since they started', () => {
    const log = new TouchLog()
    const since = log.mark()
    log.touch('x', 'A')
    log.touch('x', 'B')
    log.touch('y', 'B')
    const later = log.mark()
    expect(
      log.overlaps([
        { tabId: 'A', since },
        { tabId: 'B', since },
        { tabId: 'C', since: later },
      ]),
    ).toEqual([
      { tabId: 'A', others: ['B'], paths: ['x'] },
      { tabId: 'B', others: ['A'], paths: ['x'] },
    ])
  })

  it('stays fast for a Bash change of 20,000 files', () => {
    const log = new TouchLog()
    const paths = Array.from({ length: 20_000 }, (_, i) => `dir/file_${i}.txt`)
    const started = performance.now()
    log.touchAll(paths, 'A')
    log.touchAll(paths.slice(0, 10_000), 'B')
    for (const p of paths) log.by(p, 0)
    const overlaps = log.overlaps([
      { tabId: 'A', since: 0 },
      { tabId: 'B', since: 0 },
    ])
    expect(performance.now() - started).toBeLessThan(500)
    expect(overlaps.map((o) => o.tabId)).toEqual(['A', 'B'])
    expect(overlaps[0].paths).toHaveLength(10_000)
  })
})
