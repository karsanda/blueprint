import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface Launched {
  app: ElectronApplication
  page: Page
  log: string
  folder: string
}

export interface LaunchOptions {
  /** The Folder argument. Defaults to a fresh temp dir; `null` passes no Folder. */
  folder?: string | null
  args?: string[]
}

const root = resolve(__dirname, '../..')

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined))
}

export async function launch(opts: LaunchOptions = {}): Promise<Launched> {
  const tmp = mkdtempSync(join(tmpdir(), 'blueprint-e2e-'))
  const log = mkdtempSync(join(tmp, 'log-'))
  const home = mkdtempSync(join(tmp, 'home-'))
  const folder = opts.folder === undefined ? mkdtempSync(join(tmp, 'folder-')) : opts.folder
  const env: Record<string, string> = {
    ...definedEnv(process.env),
    HOME: home,
    BLUEPRINT_E2E: '1',
    BLUEPRINT_TEST_LOG: log,
  }
  const app = await electron.launch({
    args: [
      join(root, 'out/main/index.js'),
      '--no-sandbox',
      ...(opts.args ?? []),
      ...(folder ? [folder] : []),
    ],
    cwd: tmp,
    env,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, log, folder: folder ?? '' }
}
