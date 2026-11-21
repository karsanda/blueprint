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
  const keys: string[] = []
  listener = await startHookListener((key, e) => {
    keys.push(key)
    events.push(e)
  })
  return { events, keys, l: listener }
}

const post = (l: HookListener, body: string, auth: string | null = `Bearer ${l.token}`, key = 'k1') =>
  fetch(`${l.url}/${key}`, { method: 'POST', body, headers: auth ? { Authorization: auth } : {} })

const stopBody = (id: string) => JSON.stringify({ hook_event_name: 'Stop', session_id: id })

describe('hook listener', () => {
  it('passes a hook event on and answers 204 with no body', async () => {
    const { events, keys, l } = await start()
    const event = { hook_event_name: 'Stop', session_id: 's1' }
    const res = await post(l, JSON.stringify(event))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    await expect.poll(() => events).toEqual([event])
    expect(keys).toEqual(['k1'])
  })

  it('answers 404 without a valid start key', async () => {
    const { events, l } = await start()
    const auth = { Authorization: `Bearer ${l.token}` }
    const body = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' })
    for (const path of ['/hook', '/hook/', '/hook/bad key!', `/hook/${'a'.repeat(65)}`]) {
      const url = new URL(l.url).origin + path.replace(' ', '%20')
      expect((await fetch(url, { method: 'POST', body, headers: auth })).status).toBe(404)
    }
    expect(events).toEqual([])
  })

  it('answers 204 and keeps serving when the handler throws', async () => {
    let calls = 0
    listener = await startHookListener(() => {
      calls++
      throw new Error('boom')
    })
    const body = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' })
    expect((await post(listener, body)).status).toBe(204)
    expect((await post(listener, body)).status).toBe(204)
    await expect.poll(() => calls).toBe(2)
  })

  it('reads the fields review needs', async () => {
    const { events, l } = await start()
    const base = {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      prompt: 'hi',
      tool_name: 'Bash',
      tool_use_id: 'tu1',
    }
    await post(l, JSON.stringify({ ...base, tool_input: { file_path: '/f/a.txt' } }))
    await post(l, JSON.stringify({ ...base, tool_input: { notebook_path: '/f/n.ipynb' } }))
    await expect.poll(() => events.length).toBe(2)
    expect(events[0]).toEqual({ ...base, file_path: '/f/a.txt' })
    expect(events[1]).toEqual({ ...base, file_path: '/f/n.ipynb' })
  })

  it('waits for the handler before replying', async () => {
    listener = await startHookListener(() => new Promise<void>((r) => setTimeout(r, 300)))
    const started = Date.now()
    const res = await post(listener, JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }))
    expect(Date.now() - started).toBeGreaterThanOrEqual(250)
    expect(res.status).toBe(204)
  })

  it('replies when the handler fails', async () => {
    const seen: string[] = []
    let mode = 'reject'
    listener = await startHookListener(async (_k, e) => {
      await Promise.resolve()
      if (mode === 'reject') throw new Error('no')
      if (mode === 'throw') throw new Error('boom')
      seen.push(e.session_id)
    })
    expect((await post(listener, stopBody('a'))).status).toBe(204)
    mode = 'throw'
    expect((await post(listener, stopBody('b'))).status).toBe(204)
    mode = 'ok'
    expect((await post(listener, stopBody('c'))).status).toBe(204)
    expect(seen).toEqual(['c'])
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
      (await fetch(l.url.replace('/hook', '/other') + '/k1', { method: 'POST', body: '{}', headers: auth }))
        .status,
    ).toBe(404)
    expect((await fetch(`${l.url}/k1`, { headers: auth })).status).toBe(404)
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
