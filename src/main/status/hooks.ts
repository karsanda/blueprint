import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StatusSignal } from '../../shared/api'

/** The fields of a Claude Code hook input that Blueprint reads. Other fields are ignored. */
export interface HookInput {
  hook_event_name: string
  session_id: string
  transcript_path?: string
  notification_type?: string
}

export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PermissionRequest',
  'PostToolUse',
  'Notification',
  'Stop',
] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export interface HookMatcher {
  matcher?: string
  hooks: { type: 'http'; url: string; headers: { Authorization: string }; timeout: number }[]
}

/** Claude Code settings that send the five hook events to the listener. */
export function hookSettings(url: string, token: string): { hooks: Record<HookEvent, HookMatcher[]> } {
  const hook = { type: 'http' as const, url, headers: { Authorization: `Bearer ${token}` }, timeout: 2 }
  const matcher = (event: HookEvent): HookMatcher =>
    event === 'PermissionRequest' || event === 'PostToolUse'
      ? { matcher: '*', hooks: [hook] }
      : { hooks: [hook] }
  return {
    hooks: {
      UserPromptSubmit: [matcher('UserPromptSubmit')],
      PermissionRequest: [matcher('PermissionRequest')],
      PostToolUse: [matcher('PostToolUse')],
      Notification: [matcher('Notification')],
      Stop: [matcher('Stop')],
    },
  }
}

/** Writes settings.json into a fresh private temp dir. `remove()` deletes the dir and is safe to call twice. */
export function writeHookSettings(settings: object): { file: string; remove(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'blueprint-hooks-'))
  const file = join(dir, 'settings.json')
  writeFileSync(file, JSON.stringify(settings), { mode: 0o600 })
  return { file, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

/** What a hook event tells Blueprint about the session's status, or null when it tells nothing. */
export function signalFromHook(e: HookInput): StatusSignal | null {
  switch (e.hook_event_name) {
    case 'UserPromptSubmit':
      return { kind: 'prompt' }
    case 'PermissionRequest':
      return { kind: 'asks' }
    case 'Notification':
      return e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog'
        ? { kind: 'asks' }
        : null
    case 'PostToolUse':
      return { kind: 'tool-done' }
    case 'Stop':
      return { kind: 'stop' }
    default:
      return null
  }
}
