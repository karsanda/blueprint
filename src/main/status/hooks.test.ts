import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StatusSignal } from '../../shared/api'
import {
  createHookDir,
  HOOK_EVENTS,
  hookSettings,
  signalFromHook,
  writeHookSettings,
  type HookInput,
} from './hooks'

describe('hookSettings', () => {
  it('points the seven events at the listener with the token', () => {
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
    expect(hooks.PreToolUse[0]).toEqual({
      matcher: 'Bash',
      hooks: [
        {
          type: 'http',
          url: 'http://127.0.0.1:9/hook',
          headers: { Authorization: 'Bearer tok' },
          timeout: 10,
        },
      ],
    })
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.timeout).toBe(10)
    const withMatcher = HOOK_EVENTS.filter((e) => 'matcher' in hooks[e][0])
    expect(withMatcher).toEqual(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure'])
    expect(hooks.PostToolUseFailure[0]).toEqual({
      matcher: 'Bash',
      hooks: [
        {
          type: 'http',
          url: 'http://127.0.0.1:9/hook',
          headers: { Authorization: 'Bearer tok' },
          timeout: 2,
        },
      ],
    })
    expect(hooks.PostToolUse[0].matcher).toBe('*')
    expect(hooks.PermissionRequest[0].matcher).toBe('*')
  })
})

describe('signalFromHook', () => {
  const cases: [Partial<HookInput>, StatusSignal | null][] = [
    [{ hook_event_name: 'UserPromptSubmit' }, { kind: 'prompt' }],
    [{ hook_event_name: 'PreToolUse' }, null],
    [{ hook_event_name: 'PermissionRequest' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'permission_prompt' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'elicitation_dialog' }, { kind: 'asks' }],
    [{ hook_event_name: 'Notification', notification_type: 'idle_prompt' }, null],
    [{ hook_event_name: 'Notification', notification_type: 'auth_success' }, null],
    [{ hook_event_name: 'PostToolUse' }, { kind: 'tool-done' }],
    [{ hook_event_name: 'PostToolUseFailure' }, null],
    [{ hook_event_name: 'Stop' }, { kind: 'stop' }],
    [{ hook_event_name: 'Stop', last_assistant_message: 'Done. The tests pass.' }, { kind: 'stop' }],
    // A turn that ends on a question waits for the Developer, though no hook says so.
    [
      {
        hook_event_name: 'Stop',
        last_assistant_message: 'I found two configs.\n\nWhich one should I change?',
      },
      { kind: 'asks' },
    ],
    [{ hook_event_name: 'Stop', last_assistant_message: '**Should I go on?**\n\n' }, { kind: 'asks' }],
    [
      { hook_event_name: 'Stop', last_assistant_message: 'Why did it fail? The path was wrong.' },
      { kind: 'stop' },
    ],
    [{ hook_event_name: 'SubagentStop' }, null],
  ]
  it.each(cases)('follows the status table for %o', (input, expected) => {
    expect(signalFromHook({ hook_event_name: '', session_id: 's', ...input })).toEqual(expected)
  })
})

describe('createHookDir and writeHookSettings', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('makes a private dir in XDG_RUNTIME_DIR and removes it', () => {
    const runtime = mkdtempSync(join(tmpdir(), 'bp-runtime-'))
    vi.stubEnv('XDG_RUNTIME_DIR', runtime)
    const hookDir = createHookDir()
    expect(dirname(hookDir.dir)).toBe(runtime)
    expect(statSync(hookDir.dir).mode & 0o777).toBe(0o700)
    hookDir.remove()
    expect(existsSync(hookDir.dir)).toBe(false)
    expect(() => hookDir.remove()).not.toThrow()
    rmSync(runtime, { recursive: true })
  })

  it('falls back to the temp dir when XDG_RUNTIME_DIR does not exist', () => {
    vi.stubEnv('XDG_RUNTIME_DIR', '/nonexistent/runtime')
    const hookDir = createHookDir()
    expect(dirname(hookDir.dir)).toBe(tmpdir())
    hookDir.remove()
  })

  it('writes one private file per start key', () => {
    const hookDir = createHookDir()
    const settings = { hooks: { Stop: [] } }
    const file = writeHookSettings(hookDir.dir, 'k1', settings)
    expect(file).toBe(join(hookDir.dir, 'k1.json'))
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(settings)
    hookDir.remove()
  })
})
