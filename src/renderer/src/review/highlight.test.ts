import { afterEach, describe, expect, it, vi } from 'vitest'
import { highlightLines } from './highlight'

it('colours a TypeScript keyword', async () => {
  const lines = await highlightLines('a.ts', ['const x = 1'])
  expect(lines?.[0]?.[0]?.text).toBe('const')
  expect(lines?.[0]?.[0]?.color).toContain('--bp-code-')
})

it('leaves unknown files plain', async () => {
  expect(await highlightLines('a.xyz', ['x'])).toBeNull()
})

describe('loading', () => {
  afterEach(() => {
    vi.doUnmock('shiki/core')
    vi.doUnmock('shiki/langs/typescript.mjs')
    vi.resetModules()
  })

  it('loads a language once for concurrent requests', async () => {
    const loads = vi.fn<() => void>()
    vi.resetModules()
    vi.doMock('shiki/core', async (original) => {
      const mod = await original<typeof import('shiki/core')>()
      return {
        ...mod,
        createHighlighterCore: async (...args: Parameters<typeof mod.createHighlighterCore>) => {
          const h = await mod.createHighlighterCore(...args)
          const load = h.loadLanguage.bind(h)
          h.loadLanguage = (...langs) => {
            loads()
            return load(...langs)
          }
          return h
        },
      }
    })
    const { highlightLines: fresh } = await import('./highlight')
    const [a, b] = await Promise.all([fresh('a.ts', ['const a = 1']), fresh('b.ts', ['let b = 2'])])
    expect(a?.[0]?.[0]?.text).toBe('const')
    expect(b?.[0]?.[0]?.text).toBe('let')
    expect(loads).toHaveBeenCalledTimes(1)
  })

  it('gives null when a language cannot load, and retries later', async () => {
    vi.resetModules()
    let fail = true
    vi.doMock('shiki/langs/typescript.mjs', async (original) => {
      if (fail) throw new Error('no such language')
      return original()
    })
    const { highlightLines: fresh } = await import('./highlight')
    expect(await fresh('a.ts', ['const x = 1'])).toBeNull()
    fail = false
    expect((await fresh('a.ts', ['const x = 1']))?.[0]?.[0]?.text).toBe('const')
  })
})
