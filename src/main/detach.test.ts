import { describe, expect, it } from 'vitest'
import { detachedArgs, devUserData, shouldDetach } from './detach'

describe('shouldDetach', () => {
  it('a packaged app started from a terminal detaches', () => {
    expect(shouldDetach({ packaged: true, stdinIsTTY: true, env: {} })).toBe(true)
  })

  it('the second start, an unpackaged run and a desktop start do not', () => {
    expect(shouldDetach({ packaged: true, stdinIsTTY: true, env: { BLUEPRINT_DETACHED: '1' } })).toBe(false)
    expect(shouldDetach({ packaged: false, stdinIsTTY: true, env: {} })).toBe(false)
    expect(shouldDetach({ packaged: true, stdinIsTTY: false, env: {} })).toBe(false)
  })
})

describe('detachedArgs', () => {
  it('the folder is made absolute and flags are kept', () => {
    expect(detachedArgs(['/opt/Blueprint/blueprint', '--x', 'proj'], '/home/d')).toEqual([
      '--x',
      '/home/d/proj',
    ])
    expect(detachedArgs(['/opt/Blueprint/blueprint', '/srv/work'], '/home/d')).toEqual(['/srv/work'])
  })

  it('no folder stays no folder', () => {
    expect(detachedArgs(['/opt/Blueprint/blueprint'], '/home/d')).toEqual([])
    expect(detachedArgs(['/opt/Blueprint/blueprint', '--x'], '/home/d')).toEqual(['--x'])
  })
})

describe('devUserData', () => {
  it("only pnpm dev's data moves apart", () => {
    expect(devUserData({ packaged: false, name: 'blueprint', appData: '/home/d/.config' })).toBe(
      '/home/d/.config/blueprint-dev',
    )
    // macOS ignores letter case in paths, so a dev run named either way moves apart.
    expect(devUserData({ packaged: false, name: 'Blueprint', appData: '/home/d/.config' })).toBe(
      '/home/d/.config/blueprint-dev',
    )
    expect(devUserData({ packaged: true, name: 'Blueprint', appData: '/home/d/.config' })).toBeNull()
    expect(devUserData({ packaged: false, name: 'Electron', appData: '/home/d/.config' })).toBeNull()
  })
})
