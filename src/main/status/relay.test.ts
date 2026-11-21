import { describe, expect, it } from 'vitest'
import type { StatusSignal } from '../../shared/api'
import { StatusRelay } from './relay'

function setup() {
  const sent: [string, StatusSignal][] = []
  const calls: string[] = []
  const hook = { onInterrupt: (_sessionId: string): void => undefined }
  const relay = new StatusRelay(
    (tabId, signal) => sent.push([tabId, signal]),
    (cb) => {
      hook.onInterrupt = cb
      return {
        follow: (id, file) => calls.push(`follow ${id} ${file}`),
        unfollow: (id) => calls.push(`unfollow ${id}`),
        unfollowAll: () => calls.push('unfollowAll'),
      }
    },
  )
  return { relay, sent, calls, interrupt: (id: string) => hook.onInterrupt(id) }
}

describe('StatusRelay', () => {
  it("sends a hook's signal to its start's tab", () => {
    const { relay, sent } = setup()
    relay.register('t', 'k1')
    relay.register('u', 'k2')
    relay.hook('k2', { hook_event_name: 'Stop', session_id: 'a' })
    expect(sent).toEqual([['u', { kind: 'stop' }]])
  })

  it('ignores events from unknown start keys', () => {
    const { relay, sent, calls } = setup()
    relay.hook('zz', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/x.jsonl' })
    expect(sent).toEqual([])
    expect(calls).toEqual([])
  })

  it('a restarted tab ignores its old start and stops following its transcript', () => {
    const { relay, sent, calls } = setup()
    relay.register('t', 'k1')
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/a.jsonl' })
    sent.length = 0
    relay.register('t', 'k2')
    relay.hook('k1', { hook_event_name: 'Stop', session_id: 'a' })
    expect(sent).toEqual([])
    expect(calls).toContain('unfollow a')
  })

  it('forgets an unregistered tab: its hooks are ignored and its transcript is unfollowed', () => {
    const { relay, sent, calls } = setup()
    relay.register('t', 'k1')
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/a.jsonl' })
    sent.length = 0
    relay.unregister('t')
    relay.hook('k1', { hook_event_name: 'Stop', session_id: 'a' })
    expect(sent).toEqual([])
    expect(calls).toContain('unfollow a')
  })

  it('follows the transcript from a prompt', () => {
    const { relay, calls } = setup()
    relay.register('t', 'k1')
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/x.jsonl' })
    expect(calls).toEqual(['follow a /x.jsonl'])
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/x.jsonl' })
    expect(calls).toEqual(['follow a /x.jsonl'])
  })

  it('follows the new session after /clear', () => {
    const { relay, sent, calls, interrupt } = setup()
    relay.register('t', 'k1')
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/a.jsonl' })
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'b', transcript_path: '/b.jsonl' })
    expect(calls).toEqual(['follow a /a.jsonl', 'unfollow a', 'follow b /b.jsonl'])
    sent.length = 0
    interrupt('a')
    expect(sent).toEqual([])
    interrupt('b')
    expect(sent).toEqual([['t', { kind: 'interrupted' }]])
  })

  it('an interrupt reaches the tab that follows the session', () => {
    const { relay, sent, interrupt } = setup()
    relay.register('t', 'k1')
    relay.hook('k1', { hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/a.jsonl' })
    interrupt('other')
    expect(sent).toEqual([['t', { kind: 'prompt' }]])
    interrupt('a')
    expect(sent[1]).toEqual(['t', { kind: 'interrupted' }])
  })

  it('close stops following every transcript', () => {
    const { relay, calls } = setup()
    relay.close()
    expect(calls).toEqual(['unfollowAll'])
  })
})
