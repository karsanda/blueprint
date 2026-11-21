import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StatusSignal } from '../../shared/api'
import { HOOK_EVENTS, hookSettings, signalFromHook, writeHookSettings, type HookInput } from './hooks'

describe('hookSettings', () => {
  it('points the five events at the listener with the token', () => {
    const { hooks } = hookSettings('http://127.0.0.1:9/hook', 'tok')
    expect(Object.keys(hooks)).toEqual([...HOOK_EVENTS])
    expect(hooks.Stop[0]).toEqual({
      hooks: [
        {
          type: 'http',
          url: 'http://127.0.0.1:9/hook',
          headers: { Authorization: 'Bearer tok' },
          timeout: 2,
        },
      ],
    })
    const withMatcher = HOOK_EVENTS.filter((e) => 'matcher' in hooks[e][0])
    expect(withMatcher).toEqual(['PermissionRequest', 'PostToolUse'])
    expect(hooks.PostToolUse[0].matcher).toBe('*')
    expect(hooks.PermissionRequest[0].matcher).toBe('*')
  })
})

describe('signalFromHook', () => {
  const cases: [Partial<HookInput>, StatusSignal | null][] = [
    [{ hook_event_name: 'UserPromptSubmit' }, { kind: 'prompt' }],
    [{ hook_event_name: 'PermissionRequest' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'permission_prompt' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'elicitation_dialog' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'idle_prompt' }, null],
    [{ hook_event_name: 'Notification', notification_type: 'auth_success' }, null],
    [{ hook_event_name: 'PostToolUse' }, { kind: 'tool-done' }],
    [{ hook_event_name: 'Stop' }, { kind: 'stop' }],
    [{ hook_event_name: 'SubagentStop' }, null],
  ]
  it.each(cases)('follows the status table for %o', (input, expected) => {
    expect(signalFromHook({ hook_event_name: '', session_id: 's', ...input })).toEqual(expected)
  })
})

describe('writeHookSettings', () => {
  it('writes a private file and removes it', () => {
    const settings = { hooks: { Stop: [] } }
    const written = writeHookSettings(settings)
    const { file } = written
    const dir = dirname(file)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(settings)
    written.remove()
    expect(existsSync(dir)).toBe(false)
    expect(() => written.remove()).not.toThrow()
  })
})
