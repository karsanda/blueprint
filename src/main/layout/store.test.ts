import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WindowBounds } from '../../shared/api'
import { initialWindow, layoutFile, readLayout, writeLayout } from './store'

const dirs: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'layout-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const bounds: WindowBounds = { x: 100, y: 80, width: 1000, height: 700, maximized: false }
const area = { x: 0, y: 0, width: 1920, height: 1080 }

describe('layoutFile', () => {
  it('layoutFile puts each Folder in its own file under layouts', () => {
    expect(layoutFile('/u', '/home/d/proj')).toMatch(/^\/u\/layouts\/[0-9a-f]{16}\.json$/)
    expect(layoutFile('/u', '/home/d/other')).not.toBe(layoutFile('/u', '/home/d/proj'))
    expect(layoutFile('/u', '/home/d/proj')).toBe(layoutFile('/u', '/home/d/proj'))
    // The first 16 hex digits of sha256('/home/d/proj'): a change to the rule would orphan every saved layout.
    expect(layoutFile('/u', '/home/d/proj')).toBe('/u/layouts/c3c2cf409d22037d.json')
  })
})

describe('writeLayout and readLayout', () => {
  it('writeLayout keeps the dockview and window parts apart', () => {
    const file = layoutFile(temp(), '/f')
    writeLayout(file, '/f', { dockview: { a: 1 } })
    writeLayout(file, '/f', { window: bounds })
    expect(readLayout(file)).toEqual({ version: 1, folder: '/f', dockview: { a: 1 }, window: bounds })
    expect(readdirSync(dirname(file)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('writeLayout leaves a file written by a newer Blueprint alone', () => {
    const file = join(temp(), 'x.json')
    const newer = JSON.stringify({ version: 2, folder: '/f', dockview: { newer: true } })
    writeFileSync(file, newer)
    writeLayout(file, '/f', { dockview: { a: 1 }, window: bounds })
    expect(readFileSync(file, 'utf8')).toBe(newer)
  })

  it('readLayout ignores a file it cannot trust', () => {
    const dir = temp()
    expect(readLayout(join(dir, 'missing.json'))).toBeNull()
    mkdirSync(dir, { recursive: true })
    for (const text of ['{', '[]', '"x"', '{ "version": 2 }']) {
      const file = join(dir, 'x.json')
      writeFileSync(file, text)
      expect(readLayout(file)).toBeNull()
      expect(existsSync(file)).toBe(true)
    }
  })

  it('readLayout drops a window with broken numbers', () => {
    const file = join(temp(), 'x.json')
    const window = { x: 'a', y: 0, width: 10, height: 10, maximized: false }
    writeFileSync(file, JSON.stringify({ version: 1, folder: '/f', dockview: {}, window }))
    const layout = readLayout(file)
    expect(layout?.window).toBeUndefined()
    expect(layout?.dockview).toEqual({})
  })
})

describe('initialWindow', () => {
  it('initialWindow fits saved bounds that are bigger than the display into its work area', () => {
    const big = { ...bounds, x: 500, y: 300, width: 2500, height: 1400 }
    const { bounds: kept } = initialWindow(big, [area])
    expect(kept).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    const shifted = initialWindow({ ...bounds, x: 1500, y: 900 }, [area]).bounds
    expect(shifted).toEqual({ x: 920, y: 380, width: 1000, height: 700 })
  })

  it('initialWindow keeps bounds that are on screen', () => {
    expect(initialWindow(bounds, [area])).toEqual({
      bounds: { x: 100, y: 80, width: 1000, height: 700 },
      maximized: false,
    })
  })

  it('initialWindow drops bounds on a display that is gone', () => {
    expect(initialWindow({ ...bounds, x: 3000 }, [area]).bounds).toBeUndefined()
    expect(initialWindow({ ...bounds, x: 1870 }, [area]).bounds).toBeUndefined()
  })

  it('initialWindow keeps maximized', () => {
    expect(initialWindow({ ...bounds, maximized: true }, [area]).maximized).toBe(true)
    expect(initialWindow({ ...bounds, x: 3000, maximized: true }, [area])).toEqual({ maximized: true })
    expect(initialWindow(undefined, [area])).toEqual({ maximized: false })
  })
})
