import { expect, it } from 'vitest'
import { highlightLines } from './highlight'

it('colours a TypeScript keyword', async () => {
  const lines = await highlightLines('a.ts', ['const x = 1'])
  expect(lines?.[0]?.[0]?.text).toBe('const')
  expect(lines?.[0]?.[0]?.color).toContain('--bp-code-')
})

it('leaves unknown files plain', async () => {
  expect(await highlightLines('a.xyz', ['x'])).toBeNull()
})
