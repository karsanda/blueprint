import { describe, expect, it, vi } from 'vitest'
// sessions.ts reaches the terminal view, which needs a browser; nextTab and tabKind do not.
vi.mock('../status/notify', () => ({ focusTab: () => undefined }))
vi.mock('../terminal/session', () => ({ findSession: () => undefined }))

import { nextTab, tabKind } from './sessions'

describe('nextTab', () => {
  it('follows the only Claude tab', () => {
    expect(nextTab('claude', ['claude-1'], 0)).toEqual({ id: 'claude-2', title: 'Claude 2' })
  })
  it('ignores tabs that are not Claude', () => {
    expect(nextTab('claude', ['claude-1', 'shell-1'], 0)).toEqual({ id: 'claude-2', title: 'Claude 2' })
  })
  it('never reissues the number of a closed session', () => {
    expect(nextTab('claude', ['claude-1'], 2)).toEqual({ id: 'claude-3', title: 'Claude 3' })
  })
  it('counts on from the highest open number', () => {
    expect(nextTab('claude', ['claude-1', 'claude-2', 'claude-4'], 0).id).toBe('claude-5')
  })
  it('a shell follows the only shell', () => {
    expect(nextTab('shell', ['claude-1', 'shell-1'], 0)).toEqual({ id: 'shell-2', title: 'Shell 2' })
  })
  it('a shell never reissues the number of a closed shell', () => {
    expect(nextTab('shell', ['shell-1'], 3).id).toBe('shell-4')
  })
  it('each kind counts apart', () => {
    expect(nextTab('claude', ['claude-1', 'shell-5'], 0).id).toBe('claude-2')
  })
})

describe('tabKind', () => {
  it('tabKind names terminal tabs only', () => {
    expect(tabKind('claude-3')).toBe('claude')
    expect(tabKind('shell-12')).toBe('shell')
    for (const id of ['changes', 'shell-', 'shellx-1', 'shell-1a']) expect(tabKind(id)).toBeUndefined()
  })
})
