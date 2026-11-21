import { afterEach, describe, expect, it } from 'vitest'
import type { HookInput } from './hooks'
import { startHookListener, type HookListener } from './listener'

let listener: HookListener | undefined
afterEach(async () => {
  await listener?.close()
  listener = undefined
})

async function start() {
  const events: HookInput[] = []
  listener = await startHookListener((e) => events.push(e))
  return { events, l: listener }
}

const post = (l: HookListener, body: string, auth: string | null = `Bearer ${l.token}`) =>
  fetch(l.url, { method: 'POST', body, headers: auth ? { Authorization: auth } : {} })

describe('hook listener', () => {
  it('passes a hook event on and answers 204 with no body', async () => {
    const { events, l } = await start()
    const event = { hook_event_name: 'Stop', session_id: 's1' }
    const res = await post(l, JSON.stringify(event))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    await expect.poll(() => events).toEqual([event])
  })

  it('refuses requests without the token', async () => {
    const { events, l } = await start()
    const body = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' })
    expect((await post(l, body, null)).status).toBe(403)
    expect((await post(l, body, 'Bearer wrong')).status).toBe(403)
    expect(events).toEqual([])
  })

  it('answers 404 for another path or method', async () => {
    const { l } = await start()
    const auth = { Authorization: `Bearer ${l.token}` }
    expect(
      (await fetch(l.url.replace('/hook', '/other'), { method: 'POST', body: '{}', headers: auth })).status,
    ).toBe(404)
    expect((await fetch(l.url, { headers: auth })).status).toBe(404)
  })

  it('drops bodies that are not hook events and keeps serving', async () => {
    const { events, l } = await start()
    for (const body of ['{', '[]', '{"hook_event_name":"Stop"}']) {
      expect((await post(l, body)).status).toBe(204)
    }
    const event = { hook_event_name: 'Stop', session_id: 's2' }
    await post(l, JSON.stringify(event))
    await expect.poll(() => events).toEqual([event])
  })

  it('takes a large event', async () => {
    const { events, l } = await start()
    const event = {
      hook_event_name: 'PostToolUse',
      session_id: 's3',
      tool_response: 'x'.repeat(5 * 1024 * 1024),
    }
    expect((await post(l, JSON.stringify(event))).status).toBe(204)
    await expect.poll(() => events.length).toBe(1)
    expect(events[0]?.session_id).toBe('s3')
  })

  it('listens on 127.0.0.1 only', async () => {
    const { l } = await start()
    expect(new URL(l.url).hostname).toBe('127.0.0.1')
  })
})
