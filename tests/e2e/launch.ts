import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { ReviewState } from '../../src/shared/api'
import type { TerminalProbe } from '../../src/shared/probe'

export interface Launched {
  app: ElectronApplication
  page: Page
  log: string
  folder: string
  /** The home (and with it the user data) this launch used. */
  home: string
}

export interface LaunchOptions {
  /** The Folder argument. Defaults to a fresh temp dir; `null` passes no Folder. */
  folder?: string | null
  /** `fake` puts the fake `claude` first on PATH; `no-claude` leaves any `claude` off PATH. */
  path?: 'fake' | 'no-claude'
  args?: string[]
  /** Reuse the home of an earlier launch, and with it the user data. Defaults to a fresh one. */
  home?: string
  /** The Developer's shell (`SHELL`). Defaults to the fake shell. */
  shell?: string
  /** Variables to set, or with `undefined` to remove, in the app's environment. */
  env?: Record<string, string | undefined>
}

const root = resolve(__dirname, '../..')
const fixtureBin = join(root, 'tests/e2e/fixtures/bin')

function noClaudePath(): string {
  const dirs = [dirname(process.execPath), '/usr/bin', '/bin']
  const found = dirs.find((d) => existsSync(join(d, 'claude')))
  if (found) throw new Error(`Cannot test a missing claude: ${found} has one`)
  return dirs.join(delimiter)
}

/**
 * Tests stay off the Developer's desktop. On Linux, Chromium's headless display draws every window
 * without showing it (BLUEPRINT_E2E_HEADED=1 shows them, for debugging); macOS has no such display, so
 * there the windows show. A session bus that doesn't exist keeps desktop notifications from reaching the
 * notification daemon.
 */
const headless =
  process.env['BLUEPRINT_E2E_HEADED'] === '1' || process.platform !== 'linux'
    ? []
    : ['--ozone-platform=headless', '--ozone-override-screen-size=1920,1080']
const noSessionBus = 'unix:path=/nonexistent/blueprint-e2e-bus'

/** Where a run's temp dirs go: the run directory its global setup made, or the system's. */
const e2eRoot = (): string => process.env.BLUEPRINT_E2E_ROOT ?? tmpdir()

function definedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined))
}

export async function launch(opts: LaunchOptions = {}): Promise<Launched> {
  const tmp = mkdtempSync(join(e2eRoot(), 'blueprint-e2e-'))
  const log = mkdtempSync(join(tmp, 'log-'))
  const home = opts.home ?? mkdtempSync(join(tmp, 'home-'))
  const folder = opts.folder === undefined ? mkdtempSync(join(tmp, 'folder-')) : opts.folder
  const env: Record<string, string> = {
    ...definedEnv(process.env),
    HOME: home,
    // Electron keeps its user data under XDG_CONFIG_HOME, which the Developer's environment points at their own.
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH:
      opts.path === 'no-claude' ? noClaudePath() : `${fixtureBin}${delimiter}${process.env['PATH'] ?? ''}`,
    SHELL: opts.shell ?? join(fixtureBin, 'fake-shell'),
    // Started as from a terminal, so Blueprint does not read the login shell's environment first.
    TERM: 'xterm-256color',
    BLUEPRINT_E2E: '1',
    BLUEPRINT_TEST_LOG: log,
    DBUS_SESSION_BUS_ADDRESS: noSessionBus,
  }
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  const app = await electron.launch({
    args: [
      join(root, 'out/main/index.js'),
      '--no-sandbox',
      ...headless,
      ...(opts.args ?? []),
      ...(folder ? [folder] : []),
    ],
    cwd: tmp,
    env,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // The renderer installs the probe when its script runs, which can be after the DOM is loaded.
  await page.waitForFunction(() => window.blueprintProbe !== undefined, undefined, { timeout: 15000 })
  return { app, page, log, folder: folder ?? '', home }
}

/** A file the fake programs wrote, or '' when it doesn't exist yet. */
export function readLog(log: string, file: string): string {
  try {
    return readFileSync(join(log, file), 'utf8')
  } catch {
    return ''
  }
}

function probe(): TerminalProbe {
  const p = window.blueprintProbe
  if (!p) throw new Error('No e2e probe: is BLUEPRINT_E2E=1 set?')
  return p
}

export async function probeText(page: Page, tabId: string): Promise<string> {
  return page.evaluate(`(${probe.toString()})().text(${JSON.stringify(tabId)})`)
}

export async function probeSize(page: Page, tabId: string): Promise<{ cols: number; rows: number } | null> {
  return page.evaluate(`(${probe.toString()})().size(${JSON.stringify(tabId)})`)
}

/** Frames a tab's terminal drew since the first call for it, which starts the count at 0. */
export async function probeRenders(page: Page, tabId: string): Promise<number> {
  return page.evaluate(`(${probe.toString()})().renders(${JSON.stringify(tabId)})`)
}

export async function probeCall(page: Page, method: 'focus' | 'selectAll', tabId: string): Promise<void> {
  await page.evaluate(`(${probe.toString()})().${method}(${JSON.stringify(tabId)})`)
}

/** Focuses a tab's terminal and types into it like the Developer would. */
export async function typeInto(page: Page, tabId: string, text: string): Promise<void> {
  await probeCall(page, 'focus', tabId)
  await page.keyboard.type(text)
}

/** A temp Folder in a Git repository, with `notes.txt` and `README.md` committed. */
export function gitFolder(): string {
  const dir = mkdtempSync(join(e2eRoot(), 'blueprint-e2e-git-'))
  writeFileSync(join(dir, 'notes.txt'), 'notes: first line\nnotes: second line\n')
  writeFileSync(join(dir, 'README.md'), '# Test Folder\n\nA Folder for review tests.\n')
  // The Developer's global and system git config stay out of the test's own git calls.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  const git = (...args: string[]): void => {
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
      { cwd: dir, stdio: 'ignore', env },
    )
  }
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'Start')
  return dir
}

/** Collects every review update on `window.reviewStates` and shows the Changes pane for This turn. */
export async function watchReview(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.reviewStates = []
    window.blueprint.onReviewUpdate((state) => window.reviewStates?.push(state))
    window.blueprint.setReviewView({ range: 'turn', visible: true, tabId: null })
  })
}

export async function lastReview(page: Page): Promise<ReviewState | undefined> {
  return page.evaluate(() => window.reviewStates?.at(-1))
}

/**
 * Drags a tab onto a point of the page with the HTML5 drag events dockview listens for.
 * Playwright's dragTo starts a native drag session, which hangs a visible Electron window on Wayland.
 */
export async function dropTab(page: Page, title: string, x: number, y: number): Promise<void> {
  const fire = (type: string, at: 'tab' | 'point') =>
    page.evaluate(
      (e) => {
        const tab = [...document.querySelectorAll('.dv-tab')].find((t) => t.textContent?.trim() === e.title)
        if (!tab) throw new Error(`No tab ${e.title}`)
        window.dragData ??= new DataTransfer()
        const r = tab.getBoundingClientRect()
        const [cx, cy] = e.at === 'tab' ? [r.x + 5, r.y + 5] : [e.x, e.y]
        const el = e.at === 'tab' ? tab : document.elementFromPoint(e.x, e.y)
        el?.dispatchEvent(
          new DragEvent(e.type, {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            dataTransfer: window.dragData,
          }),
        )
        if (e.type === 'dragend') window.dragData = undefined
      },
      { title, type, at, x, y },
    )
  await fire('dragstart', 'tab')
  for (const type of ['dragenter', 'dragover', 'dragover', 'drop']) {
    await page.waitForTimeout(50)
    await fire(type, 'point')
  }
  await fire('dragend', 'tab')
}
