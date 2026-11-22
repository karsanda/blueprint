import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The settings files Claude Code reads for a session in the Folder, by scope. */
export interface SettingsFiles {
  /** `managed-settings.json`, then each drop-in of `managed-settings.d` in name order: a later one wins. */
  managed: string[]
  local: string
  project: string
  user: string
}

/** Where Claude Code keeps managed settings on this platform. */
export function managedSettingsDir(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code'
}

/**
 * The settings files of a Claude session in `folder`. `managedDir` holds `managed-settings.json` and its
 * `managed-settings.d` drop-ins: every `*.json` there that is not hidden, in name order.
 */
export function claudeSettingsFiles(
  folder: string,
  env: NodeJS.ProcessEnv,
  managedDir: string,
): SettingsFiles {
  let dropIns: string[] = []
  try {
    dropIns = readdirSync(join(managedDir, 'managed-settings.d'))
      .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
      .toSorted()
      .map((name) => join(managedDir, 'managed-settings.d', name))
  } catch {
    // No drop-in dir.
  }
  const configDir = env['CLAUDE_CONFIG_DIR'] || join(env['HOME'] ?? '', '.claude')
  return {
    managed: [join(managedDir, 'managed-settings.json'), ...dropIns],
    local: join(folder, '.claude', 'settings.local.json'),
    project: join(folder, '.claude', 'settings.json'),
    user: join(configDir, 'settings.json'),
  }
}

function readSettings(file: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : undefined
  } catch {
    return undefined
  }
}

/** A URL pattern of `allowedHttpHookUrls`, where `*` stands for any text. */
function matches(pattern: string, url: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`, 'i').test(url)
}

/**
 * Why Claude Code will not run Blueprint's hooks at `hookUrl`, as the files say, or null when nothing in
 * them blocks the hooks. Settings that MDM profiles or a server deliver cannot be read, so they are not
 * checked. Follows Claude Code's settings reference:
 * - `allowManagedHooksOnly`, set in managed settings only: any true blocks every hook not managed;
 * - `disableAllHooks`: the value of the strongest scope that sets it (managed, local, project, user);
 * - `allowedHttpHookUrls`: when any file sets it, the lists merge, and only a URL matching one runs.
 */
export function hooksBlockedBy(files: SettingsFiles, hookUrl: string): string | null {
  const managed = files.managed.map((file) => ({ file, settings: readSettings(file) }))
  const others = [files.local, files.project, files.user].map((file) => ({
    file,
    settings: readSettings(file),
  }))

  const managedOnly = managed.find((m) => m.settings?.['allowManagedHooksOnly'] === true)
  if (managedOnly) {
    return `Claude Code's managed settings allow only their own hooks (allowManagedHooksOnly in ${managedOnly.file}).`
  }

  // Within managed settings a later drop-in wins; managed settings win over every other scope.
  const strongestFirst = [...managed.toReversed(), ...others]
  const disabling = strongestFirst.find((s) => typeof s.settings?.['disableAllHooks'] === 'boolean')
  if (disabling?.settings?.['disableAllHooks'] === true) {
    return `Claude Code's settings turn off hooks (disableAllHooks in ${disabling.file}).`
  }

  const listing = [...managed, ...others].filter((s) => Array.isArray(s.settings?.['allowedHttpHookUrls']))
  if (listing.length > 0) {
    const patterns = listing.flatMap((s) => {
      const list = s.settings?.['allowedHttpHookUrls']
      return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : []
    })
    if (!patterns.some((p) => matches(p, hookUrl))) {
      const where = listing.map((s) => s.file).join(', ')
      return `Claude Code's settings allow hooks only to listed addresses, and Blueprint's is not one (allowedHttpHookUrls in ${where}).`
    }
  }
  return null
}
