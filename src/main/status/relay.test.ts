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
  it("sends a hook's signal to its session's tab", () => {
    const { relay, sent } = setup()
    relay.register('t', 'a')
    relay.hook({ hook_event_name: 'Stop', session_id: 'a' })
    expect(sent).toEqual([['t', { kind: 'stop' }]])
  })

  it('ignores events from unknown sessions', () => {
    const { relay, sent, calls } = setup()
    relay.hook({ hook_event_name: 'UserPromptSubmit', session_id: 'zz', transcript_path: '/x.jsonl' })
    expect(sent).toEqual([])
    expect(calls).toEqual([])
  })

  it('a restarted tab ignores its old session', () => {
    const { relay, sent, calls } = setup()
    relay.register('t', 'a')
    relay.register('t', 'b')
    relay.hook({ hook_event_name: 'Stop', session_id: 'a' })
    expect(sent).toEqual([])
    expect(calls).toContain('unfollow a')
  })

  it('follows the transcript from a prompt', () => {
    const { relay, calls } = setup()
    relay.register('t', 'a')
    relay.hook({ hook_event_name: 'UserPromptSubmit', session_id: 'a', transcript_path: '/x.jsonl' })
    expect(calls).toContain('follow a /x.jsonl')
  })

  it('an interrupt reaches the tab', () => {
    const { relay, sent, interrupt } = setup()
    relay.register('t', 'a')
    interrupt('a')
    expect(sent).toEqual([['t', { kind: 'interrupted' }]])
  })

  it('close stops following every transcript', () => {
    const { relay, calls } = setup()
    relay.close()
    expect(calls).toEqual(['unfollowAll'])
  })
})
