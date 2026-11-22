import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeSettingsFiles, hooksBlockedBy, type SettingsFiles } from './blocked'

const dirs: string[] = []
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blocked-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const URL = 'http://127.0.0.1:41234/hook/0b8c'

/** Settings files under one temp dir, written only when a test gives them content. */
function files(
  content: Partial<Record<'managed' | 'dropIn' | 'local' | 'project' | 'user', object | string>>,
): SettingsFiles {
  const root = temp()
  const paths = {
    managed: join(root, 'etc/managed-settings.json'),
    dropIn: join(root, 'etc/managed-settings.d/10-hooks.json'),
    local: join(root, 'folder/.claude/settings.local.json'),
    project: join(root, 'folder/.claude/settings.json'),
    user: join(root, 'home/.claude/settings.json'),
  }
  const keys = ['managed', 'dropIn', 'local', 'project', 'user'] as const
  for (const key of keys) {
    const file = paths[key]
    const value = content[key]
    if (value === undefined) continue
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return {
    managed: [paths.managed, paths.dropIn],
    local: paths.local,
    project: paths.project,
    user: paths.user,
  }
}

describe('claudeSettingsFiles', () => {
  it('lists the managed file and its drop-ins in name order, then the Folder and user files', () => {
    const root = temp()
    const managedDir = join(root, 'etc/claude-code')
    mkdirSync(join(managedDir, 'managed-settings.d'), { recursive: true })
    for (const name of ['20-b.json', '10-a.json', 'notes.txt', '.hidden.json'])
      writeFileSync(join(managedDir, 'managed-settings.d', name), '{}')
    const found = claudeSettingsFiles('/work/proj', { HOME: '/home/d' }, managedDir)
    expect(found).toEqual({
      managed: [
        join(managedDir, 'managed-settings.json'),
        join(managedDir, 'managed-settings.d/10-a.json'),
        join(managedDir, 'managed-settings.d/20-b.json'),
      ],
      local: '/work/proj/.claude/settings.local.json',
      project: '/work/proj/.claude/settings.json',
      user: '/home/d/.claude/settings.json',
    })
  })

  it('takes the user settings from CLAUDE_CONFIG_DIR when it is set', () => {
    const found = claudeSettingsFiles('/work/proj', { HOME: '/home/d', CLAUDE_CONFIG_DIR: '/cfg' }, temp())
    expect(found.user).toBe('/cfg/settings.json')
  })
})

describe('hooksBlockedBy', () => {
  it('finds nothing when no settings file exists', () => {
    expect(hooksBlockedBy(files({}), URL)).toBeNull()
  })

  it("names the Developer's own disableAllHooks", () => {
    const f = files({ user: { disableAllHooks: true } })
    expect(hooksBlockedBy(f, URL)).toBe(
      `Claude Code's settings turn off hooks (disableAllHooks in ${f.user}).`,
    )
  })

  it("lets a project's disableAllHooks false win over the user's true", () => {
    expect(
      hooksBlockedBy(files({ user: { disableAllHooks: true }, project: { disableAllHooks: false } }), URL),
    ).toBeNull()
  })

  it('names a managed allowManagedHooksOnly, from a drop-in too', () => {
    const f = files({ dropIn: { allowManagedHooksOnly: true } })
    expect(hooksBlockedBy(f, URL)).toBe(
      `Claude Code's managed settings allow only their own hooks (allowManagedHooksOnly in ${f.managed[1]}).`,
    )
  })

  it('ignores allowManagedHooksOnly outside managed settings', () => {
    expect(hooksBlockedBy(files({ user: { allowManagedHooksOnly: true } }), URL)).toBeNull()
  })

  it("names an allowedHttpHookUrls that does not list Blueprint's address", () => {
    const f = files({ user: { allowedHttpHookUrls: ['https://hooks.example.com/*'] } })
    expect(hooksBlockedBy(f, URL)).toBe(
      `Claude Code's settings allow hooks only to listed addresses, and Blueprint's is not one (allowedHttpHookUrls in ${f.user}).`,
    )
  })

  it("accepts an allowedHttpHookUrls whose merged list matches Blueprint's address", () => {
    const f = files({
      managed: { allowedHttpHookUrls: ['https://hooks.example.com/*'] },
      project: { allowedHttpHookUrls: ['http://127.0.0.1:*'] },
    })
    expect(hooksBlockedBy(f, URL)).toBeNull()
  })

  it('skips a settings file it cannot read as JSON', () => {
    expect(hooksBlockedBy(files({ user: '{ not json' }), URL)).toBeNull()
  })
})
