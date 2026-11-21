import { describe, expect, it, vi } from 'vitest'
// sessions.ts reaches the terminal view, which needs a browser; nextClaudeTab does not.
vi.mock('../status/notify', () => ({ focusTab: () => undefined }))
vi.mock('../terminal/session', () => ({ findSession: () => undefined }))

import { nextClaudeTab } from './sessions'

describe('nextClaudeTab', () => {
  it('follows the only Claude tab', () => {
    expect(nextClaudeTab(['claude-1'])).toEqual({ id: 'claude-2', title: 'Claude 2' })
  })
  it('ignores tabs that are not Claude', () => {
    expect(nextClaudeTab(['claude-1', 'shell-1'])).toEqual({ id: 'claude-2', title: 'Claude 2' })
  })
  it('counts on from the highest open number', () => {
    expect(nextClaudeTab(['claude-1', 'claude-2', 'claude-4']).id).toBe('claude-5')
  })
})
