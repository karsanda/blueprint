import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StatusSignal } from '../../shared/api'

/** The fields of a Claude Code hook input that Blueprint reads. Other fields are ignored. */
export interface HookInput {
  hook_event_name: string
  session_id: string
  transcript_path?: string
  notification_type?: string
  prompt?: string
  tool_name?: string
  tool_use_id?: string
  file_path?: string
  /** On `Stop`: the text of Claude's final response. */
  last_assistant_message?: string
}

export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export interface HookMatcher {
  matcher?: string
  hooks: { type: 'http'; url: string; headers: { Authorization: string }; timeout: number }[]
}

/** Claude Code settings that send the seven hook events to the listener. */
export function hookSettings(url: string, token: string): { hooks: Record<HookEvent, HookMatcher[]> } {
  const hook = (timeout: number) => ({
    type: 'http' as const,
    url,
    headers: { Authorization: `Bearer ${token}` },
    timeout,
  })
  const matcher = (event: HookEvent): HookMatcher => {
    switch (event) {
      case 'UserPromptSubmit':
        return { hooks: [hook(10)] }
      case 'PreToolUse':
        return { matcher: 'Bash', hooks: [hook(10)] }
      case 'PostToolUseFailure':
        return { matcher: 'Bash', hooks: [hook(2)] }
      case 'PermissionRequest':
      case 'PostToolUse':
        return { matcher: '*', hooks: [hook(2)] }
      default:
        return { hooks: [hook(2)] }
    }
  }
  return {
    hooks: {
      UserPromptSubmit: [matcher('UserPromptSubmit')],
      PreToolUse: [matcher('PreToolUse')],
      PermissionRequest: [matcher('PermissionRequest')],
      PostToolUse: [matcher('PostToolUse')],
      PostToolUseFailure: [matcher('PostToolUseFailure')],
      Notification: [matcher('Notification')],
      Stop: [matcher('Stop')],
    },
  }
}

/**
 * Makes the private (0700) dir that holds the settings files. It lives in $XDG_RUNTIME_DIR when that
 * is set and exists. `remove()` deletes the dir and is safe to call twice.
 */
export function createHookDir(): { dir: string; remove(): void } {
  const runtime = process.env['XDG_RUNTIME_DIR']
  const base = runtime && existsSync(runtime) ? runtime : tmpdir()
  const dir = mkdtempSync(join(base, 'blueprint-hooks-'))
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Writes the settings for one Claude start to `<dir>/<startKey>.json`, private to the Developer. */
export function writeHookSettings(dir: string, startKey: string, settings: object): string {
  const file = join(dir, `${startKey}.json`)
  writeFileSync(file, JSON.stringify(settings), { mode: 0o600 })
  return file
}

/**
 * Whether Claude's final response ends on a question: its last line, past any closing marks of Markdown or
 * quotes, ends in a question mark. Claude Code then waits for the Developer's answer, but no hook says so.
 */
export function endsOnQuestion(message: string | undefined): boolean {
  if (!message) return false
  const last = message.trimEnd().split('\n').at(-1) ?? ''
  return /[?？][*_`)\]"'”’»]*$/.test(last.trimEnd())
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
      return endsOnQuestion(e.last_assistant_message) ? { kind: 'asks' } : { kind: 'stop' }
    default:
      return null
  }
}
