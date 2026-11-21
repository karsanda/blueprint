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

  it("a path touched in an earlier turn is not this turn's", () => {
    const log = new TouchLog()
    log.startTurn()
    log.touch('a')
    log.startTurn()
    expect(log.touched('a', 'turn')).toBe(false)
    expect(log.touched('a', 'session')).toBe(true)
  })

  it("a path touched again in this turn is this turn's", () => {
    const log = new TouchLog()
    log.startTurn()
    log.touch('a')
    log.startTurn()
    log.touch('a')
    expect(log.touched('a', 'turn')).toBe(true)
  })
})
