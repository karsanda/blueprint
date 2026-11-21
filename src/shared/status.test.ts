import { describe, expect, it } from 'vitest'
import type { ClaudeStatus, StatusSignal } from './api'
import { nextStatus, windowTitle } from './status'

describe('nextStatus', () => {
  const cases: [ClaudeStatus, StatusSignal, ClaudeStatus][] = [
    ['idle', { kind: 'prompt' }, 'working'],
    ['working', { kind: 'prompt' }, 'working'],
    ['needs-you', { kind: 'prompt' }, 'working'],
    ['idle', { kind: 'asks' }, 'needs-you'],
    ['working', { kind: 'asks' }, 'needs-you'],
    ['needs-you', { kind: 'asks' }, 'needs-you'],
    ['idle', { kind: 'tool-done' }, 'working'],
    ['working', { kind: 'tool-done' }, 'working'],
    ['needs-you', { kind: 'tool-done' }, 'needs-you'],
    ['idle', { kind: 'stop' }, 'idle'],
    ['working', { kind: 'stop' }, 'idle'],
    ['needs-you', { kind: 'stop' }, 'idle'],
    ['idle', { kind: 'interrupted' }, 'idle'],
    ['working', { kind: 'interrupted' }, 'idle'],
    ['needs-you', { kind: 'interrupted' }, 'idle'],
    ['idle', { kind: 'typed' }, 'idle'],
    ['working', { kind: 'typed' }, 'working'],
    ['needs-you', { kind: 'typed' }, 'working'],
  ]
  it.each(cases)('nextStatus follows the status rules for %s and %o', (current, signal, expected) => {
    expect(nextStatus(current, signal)).toBe(expected)
  })

  it('a finished tool keeps Needs you', () => {
    expect(nextStatus('needs-you', { kind: 'tool-done' })).toBe('needs-you')
  })

  it('typing only clears Needs you', () => {
    expect(nextStatus('idle', { kind: 'typed' })).toBe('idle')
    expect(nextStatus('working', { kind: 'typed' })).toBe('working')
  })
})

describe('windowTitle', () => {
  it('lists the sessions that need the Developer', () => {
    expect(windowTitle([])).toBe('Blueprint')
    expect(windowTitle(['Claude'])).toBe('Needs you: Claude — Blueprint')
    expect(windowTitle(['Claude', 'Claude 2'])).toBe('Needs you: Claude, Claude 2 — Blueprint')
  })
})
