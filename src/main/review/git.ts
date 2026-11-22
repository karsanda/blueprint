import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Change } from '../../shared/api'

export type GitChange = Omit<Change, 'by'>
export type GitProblem = 'no-git' | 'not-a-repo'

const KINDS: Record<string, GitChange['kind']> = { A: 'added', D: 'deleted', M: 'modified', T: 'modified' }

/**
 * Reads the `-z` outputs of `git diff --raw --no-abbrev` and `git diff --numstat`, in raw order. A Change's id
 * is the blob of its new content, or of its removed content for a deleted file.
 */
export function parseChanges(raw: string, numstat: string): GitChange[] {
  const counts = new Map<string, { added: number; removed: number; binary: boolean }>()
  for (const record of numstat.split('\0')) {
    const [added, removed, ...rest] = record.split('\t')
    const path = rest.join('\t')
    if (!path) continue
    const binary = added === '-' && removed === '-'
    counts.set(path, { added: binary ? 0 : Number(added), removed: binary ? 0 : Number(removed), binary })
  }
  const tokens = raw.split('\0')
  const changes: GitChange[] = []
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    // `:<old mode> <new mode> <old blob> <new blob> <status>`, then the path.
    const [, , oldBlob, newBlob, status] = tokens[i].split(' ')
    const kind = status === undefined ? undefined : KINDS[status]
    const path = tokens[i + 1]
    const id = kind === 'deleted' ? oldBlob : newBlob
    if (!kind || !path || !id) continue
    changes.push({ path, id, kind, ...(counts.get(path) ?? { added: 0, removed: 0, binary: false }) })
  }
  return changes
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined
}

/** Config on top of the Developer's that keeps git from writing into the repository or running their hooks. */
const ISOLATING_CONFIG: [string, string][] = [
  ['core.fsmonitor', 'false'],
  ['core.splitIndex', 'false'],
  ['core.hooksPath', '/dev/null'],
  ['gc.auto', '0'],
  // With `core.autocrlf`, `true` refuses a file with mixed line endings. It only checks; it never writes.
  ['core.safecrlf', 'false'],
]

/**
 * Leaves out the files Git LFS stores. Its filter would write each one into `.git/lfs`, and its whole content
 * into the store, on every launch. Their Changes are not listed.
 */
const NOT_LFS = ':(exclude,attr:filter=lfs)'

/**
 * The environment of every git command Blueprint runs. Whatever the repository's config says, git starts no
 * daemon, writes no split index, runs no hook and collects no garbage. The repository's attributes apply,
 * so its eol rules and clean filters run as in the Developer's own `git add`. Pathspec settings inherited
 * from Blueprint's own environment are off: the add needs pathspec magic, and the one-file diff turns on
 * `--literal-pathspecs` itself.
 */
function gitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_LITERAL_PATHSPECS: '0',
    GIT_GLOB_PATHSPECS: '0',
    GIT_NOGLOB_PATHSPECS: '0',
    GIT_ICASE_PATHSPECS: '0',
    GIT_CONFIG_COUNT: String(ISOLATING_CONFIG.length),
    ...extra,
  }
  ISOLATING_CONFIG.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key
    env[`GIT_CONFIG_VALUE_${i}`] = value
  })
  return env
}

/**
 * How long a store command may run before it is killed. Only a hung git takes this long: how long Claude and
 * the hooks wait for a snapshot is bounded on its own, in ReviewService, and a slow snapshot may finish.
 */
const TIMEOUT_MS = 300_000
/** How long `rev-parse` may take when a store opens. It reads no working files, and the window waits for it. */
const OPEN_TIMEOUT_MS = 8000

/** A git command that gave no answer in time, and was killed. */
export class GitTimeout extends Error {
  override name = 'GitTimeout'
}

function run(
  git: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(git, args, { cwd, env, encoding: 'utf8', maxBuffer: 1 << 30 }, (error, stdout) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(stdout)
    })
    // Gives up at once, even on a git that does not end when killed, so nothing waits on it any longer.
    const timer = setTimeout(() => {
      child.kill()
      const command = args.find((arg) => !arg.startsWith('-'))
      reject(new GitTimeout(`git ${command} gave no answer in ${timeoutMs} ms`))
    }, timeoutMs)
  })
}

/**
 * Records the Folder as git trees in Blueprint's own index and object store, so the Developer's repository
 * is never written. The repository's objects are only read, through GIT_ALTERNATE_OBJECT_DIRECTORIES.
 */
export class SnapshotStore {
  private chain: Promise<unknown> = Promise.resolve()
  private running = 0

  private constructor(
    private readonly folder: string,
    private readonly git: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly timeoutMs: number,
  ) {}

  /**
   * `git` is the git program. `timeoutMs` is how long a store command may run before it is killed, and
   * `openTimeoutMs` the same for `rev-parse`. A `rev-parse` that gives no answer rejects with GitTimeout: it
   * says nothing about the Folder. With `keep`, the store's objects stay from an earlier run, so the trees
   * kept there can still be compared. Each run then gets an index of its own, named for the run: a git that
   * an earlier run left running may write its index late, over objects the store has since dropped.
   */
  static async open(
    folder: string,
    storeDir: string,
    {
      git = 'git',
      timeoutMs = TIMEOUT_MS,
      openTimeoutMs = OPEN_TIMEOUT_MS,
      keep = false,
    }: { git?: string; timeoutMs?: number; openTimeoutMs?: number; keep?: boolean } = {},
  ): Promise<SnapshotStore | { problem: GitProblem }> {
    let objects: string
    try {
      const args = ['rev-parse', '--path-format=absolute', '--git-path', 'objects']
      objects = (await run(git, args, folder, gitEnv(), openTimeoutMs)).trim()
    } catch (error) {
      if (error instanceof GitTimeout) throw error
      return { problem: errorCode(error) === 'ENOENT' ? 'no-git' : 'not-a-repo' }
    }
    if (!keep) rmSync(storeDir, { recursive: true, force: true })
    mkdirSync(join(storeDir, 'objects'), { recursive: true })
    let index = join(storeDir, 'index')
    if (keep) {
      // The indexes of earlier runs, and their locks, go: none of them is this run's.
      for (const name of readdirSync(storeDir)) {
        if (name.startsWith('index')) rmSync(join(storeDir, name), { force: true })
      }
      index = join(storeDir, `index-${process.pid}-${randomBytes(4).toString('hex')}`)
    }
    const env = gitEnv({
      GIT_INDEX_FILE: index,
      GIT_OBJECT_DIRECTORY: join(storeDir, 'objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: objects,
    })
    return new SnapshotStore(folder, git, env, timeoutMs)
  }

  get busy(): boolean {
    return this.running > 0
  }

  /** Records the Folder as it is now and returns the tree id. Snapshots run one at a time, in call order. */
  snapshot(): Promise<string> {
    this.running++
    const result = this.chain.then(async () => {
      await this.exec(['add', '-A', '--', '.', NOT_LFS])
      return (await this.exec(['write-tree'])).trim()
    })
    this.chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result.finally(() => {
      this.running--
    })
  }

  /** Whether the store, or the repository behind it, still has this tree. */
  async has(tree: string): Promise<boolean> {
    try {
      await this.exec(['cat-file', '-e', `${tree}^{tree}`])
      return true
    } catch {
      return false
    }
  }

  async changes(base: string, now: string): Promise<GitChange[]> {
    const [raw, numstat] = await Promise.all([
      this.exec(['diff', '--no-renames', '--relative', '-z', '--raw', '--no-abbrev', base, now]),
      this.exec(['diff', '--no-renames', '--relative', '-z', '--numstat', base, now]),
    ])
    return parseChanges(raw, numstat)
  }

  /** `--literal-pathspecs` makes a path like `app/[id]/page.tsx` name that file only, not a glob. */
  diff(base: string, now: string, path: string): Promise<string> {
    return this.exec([
      '--literal-pathspecs',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--relative',
      base,
      now,
      '--',
      path,
    ])
  }

  private exec(args: string[]): Promise<string> {
    return run(this.git, args, this.folder, this.env, this.timeoutMs)
  }
}

function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return errorCode(error) === 'ESRCH'
  }
}

/** Makes this run's private dir `<base>/review-<pid>-XXXXXX`, after clearing the dirs of runs that are gone. */
export function createReviewDir(base: string): { dir: string; remove(): void } {
  mkdirSync(base, { recursive: true })
  for (const name of readdirSync(base)) {
    const match = /^review-(\d+)-/.exec(name)
    if (match && isGone(Number(match[1]))) rmSync(join(base, name), { recursive: true, force: true })
  }
  const dir = mkdtempSync(join(base, `review-${process.pid}-`))
  chmodSync(dir, 0o700)
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) }
}
