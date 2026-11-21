import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createReviewDir, parseChanges, SnapshotStore } from './git'

const dirs: string[] = []
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Runs git for the test's own setup, away from the Developer's global and system config. */
function git(repo: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    },
  )
}

function makeRepo(): string {
  const repo = temp('bp-repo-')
  git(repo, 'init', '-q')
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  writeFileSync(join(repo, 'b.txt'), 'alpha\nbeta\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'first')
  return repo
}

/** Git's id for a file with this content. */
function blob(content: string | Buffer): string {
  const bytes = Buffer.from(content)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

async function open(folder: string): Promise<SnapshotStore> {
  const store = await SnapshotStore.open(folder, temp('bp-store-'))
  if (!(store instanceof SnapshotStore)) throw new Error(`open failed: ${store.problem}`)
  return store
}

/** A `git` whose `add` hangs until `release` is called, and that runs the real git otherwise. */
function hangingGit(): { git: string; release(): void } {
  const dir = temp('bp-fake-git-')
  const hang = join(dir, 'hang')
  const program = join(dir, 'git')
  writeFileSync(hang, '')
  writeFileSync(
    program,
    `#!/bin/sh\nif [ "$1" = add ] && [ -e '${hang}' ]; then exec sleep 5; fi\nexec git "$@"\n`,
  )
  chmodSync(program, 0o755)
  return { git: program, release: () => rmSync(hang) }
}

function objectFiles(repo: string): string[] {
  const out: string[] = []
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`)
      else out.push(`${rel}${e.name}`)
    }
  }
  walk(join(repo, '.git', 'objects'), '')
  return out.toSorted()
}

describe('SnapshotStore', () => {
  it('lists a changed, a new and a deleted file', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const before = await store.snapshot()
    writeFileSync(join(repo, 'a.txt'), 'ONE\ntwo\n')
    writeFileSync(join(repo, 'new.txt'), 'x\n')
    rmSync(join(repo, 'b.txt'))
    const after = await store.snapshot()
    expect(await store.changes(before, after)).toEqual([
      { path: 'a.txt', id: blob('ONE\ntwo\n'), kind: 'modified', added: 1, removed: 1, binary: false },
      { path: 'b.txt', id: blob('alpha\nbeta\n'), kind: 'deleted', added: 0, removed: 2, binary: false },
      { path: 'new.txt', id: blob('x\n'), kind: 'added', added: 1, removed: 0, binary: false },
    ])
  })

  it('a file that changes again with the same counts gets a new id', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const base = await store.snapshot()
    writeFileSync(join(repo, 'a.txt'), 'foo\ntwo\n')
    const first = (await store.changes(base, await store.snapshot()))[0]
    writeFileSync(join(repo, 'a.txt'), 'bar\ntwo\n')
    const second = (await store.changes(base, await store.snapshot()))[0]
    expect(second).toMatchObject({ path: 'a.txt', added: 1, removed: 1, id: blob('bar\ntwo\n') })
    expect(second?.id).not.toBe(first?.id)
  })

  it('writes nothing into the repository', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const objects = objectFiles(repo)
    const indexTime = statSync(join(repo, '.git', 'index')).mtimeMs
    await store.snapshot()
    writeFileSync(join(repo, 'a.txt'), 'ONE\ntwo\n')
    const status = git(repo, '--no-optional-locks', 'status', '--porcelain')
    await store.snapshot()
    expect(objectFiles(repo)).toEqual(objects)
    expect(statSync(join(repo, '.git', 'index')).mtimeMs).toBe(indexTime)
    expect(git(repo, '--no-optional-locks', 'status', '--porcelain')).toBe(status)
  })

  it('counts untracked files and skips ignored ones', async () => {
    const repo = makeRepo()
    writeFileSync(join(repo, '.gitignore'), 'ignored/\n')
    git(repo, 'add', '.gitignore')
    git(repo, 'commit', '-q', '-m', 'ignore')
    const store = await open(repo)
    const before = await store.snapshot()
    mkdirSync(join(repo, 'ignored'))
    writeFileSync(join(repo, 'ignored', 'x'), 'x\n')
    writeFileSync(join(repo, 'untracked.txt'), 'u\n')
    const after = await store.snapshot()
    expect((await store.changes(before, after)).map((c) => c.path)).toEqual(['untracked.txt'])
  })

  it('a Folder inside a repository sees only its own files, relative to it', async () => {
    const repo = makeRepo()
    mkdirSync(join(repo, 'sub'))
    writeFileSync(join(repo, 'sub', 'x.txt'), 'x\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'sub')
    const store = await open(join(repo, 'sub'))
    const before = await store.snapshot()
    writeFileSync(join(repo, 'sub', 'x.txt'), 'y\n')
    writeFileSync(join(repo, 'a.txt'), 'ONE\ntwo\n')
    const after = await store.snapshot()
    expect((await store.changes(before, after)).map((c) => c.path)).toEqual(['x.txt'])
  })

  it('paths with spaces and non-ASCII letters come through', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const before = await store.snapshot()
    writeFileSync(join(repo, 'a file ü.txt'), 'x\n')
    const after = await store.snapshot()
    expect((await store.changes(before, after)).map((c) => c.path)).toEqual(['a file ü.txt'])
  })

  it('marks a binary file', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const before = await store.snapshot()
    writeFileSync(join(repo, 'bin.dat'), Buffer.from([0, 1, 2, 0, 3]))
    const after = await store.snapshot()
    expect(await store.changes(before, after)).toEqual([
      {
        path: 'bin.dat',
        id: blob(Buffer.from([0, 1, 2, 0, 3])),
        kind: 'added',
        added: 0,
        removed: 0,
        binary: true,
      },
    ])
  })

  it('diff of a path with brackets shows that file only', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const before = await store.snapshot()
    mkdirSync(join(repo, 'app', '[id]'), { recursive: true })
    mkdirSync(join(repo, 'app', 'i'))
    writeFileSync(join(repo, 'app', '[id]', 'page.tsx'), 'bracketed\n')
    writeFileSync(join(repo, 'app', 'i', 'page.tsx'), 'plain\n')
    const after = await store.snapshot()
    const patch = await store.diff(before, after, 'app/[id]/page.tsx')
    expect(patch).toContain('\n+bracketed\n')
    expect(patch).not.toContain('plain')
  })

  it('snapshots run one at a time', async () => {
    const repo = makeRepo()
    const store = await open(repo)
    const all = Promise.all([1, 2, 3, 4, 5].map(() => store.snapshot()))
    expect(store.busy).toBe(true)
    expect(await all).toHaveLength(5)
    expect(store.busy).toBe(false)
  })

  it('a git that hangs is stopped after the timeout, and frees the store for the next snapshot', async () => {
    const repo = makeRepo()
    const fake = hangingGit()
    const store = await SnapshotStore.open(repo, temp('bp-store-'), { git: fake.git, timeoutMs: 200 })
    if (!(store instanceof SnapshotStore)) throw new Error(`open failed: ${store.problem}`)
    const started = Date.now()
    await expect(store.snapshot()).rejects.toThrow('git add gave no answer in 200 ms')
    expect(Date.now() - started).toBeLessThan(1000)
    expect(store.busy).toBe(false)
    fake.release()
    expect(await store.snapshot()).toMatch(/^[0-9a-f]{40}$/)
  })

  it('a repository with no commits works', async () => {
    const repo = temp('bp-repo-')
    git(repo, 'init', '-q')
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    const store = await open(repo)
    const before = await store.snapshot()
    writeFileSync(join(repo, 'new.txt'), 'x\n')
    const after = await store.snapshot()
    expect((await store.changes(before, after)).map((c) => c.path)).toEqual(['new.txt'])
  })

  it('open reports a Folder outside any repository, and missing Git', async () => {
    const plain = temp('bp-plain-')
    expect(await SnapshotStore.open(plain, temp('bp-store-'))).toEqual({ problem: 'not-a-repo' })
    const repo = makeRepo()
    expect(await SnapshotStore.open(repo, temp('bp-store-'), { git: '/nonexistent/git' })).toEqual({
      problem: 'no-git',
    })
  })
})

describe("SnapshotStore with the Developer's git config", () => {
  it('snapshots leave .git as it was, and run no daemon, hook or filter of the repository', async () => {
    const repo = makeRepo()
    const marks = temp('bp-marks-')
    writeFileSync(join(repo, '.gitattributes'), '*.txt filter=mark\n')
    git(repo, 'add', '.gitattributes')
    git(repo, 'commit', '-q', '-m', 'attributes')
    git(repo, 'config', 'core.fsmonitor', 'true')
    git(repo, 'config', 'core.splitIndex', 'true')
    git(repo, 'config', 'filter.mark.clean', `touch '${join(marks, 'filter')}' && cat`)
    const hook = join(repo, '.git', 'hooks', 'post-index-change')
    writeFileSync(hook, `#!/bin/sh\ntouch '${join(marks, 'hook')}'\n`)
    chmodSync(hook, 0o755)
    const listing = (): string[] =>
      readdirSync(join(repo, '.git'), { recursive: true }).map(String).toSorted()
    const before = listing()
    const store = await open(repo)
    const first = await store.snapshot()
    writeFileSync(join(repo, 'a.txt'), 'ONE\ntwo\n')
    const second = await store.snapshot()
    expect((await store.changes(first, second)).map((c) => c.path)).toEqual(['a.txt'])
    expect(listing()).toEqual(before)
    expect(existsSync(join(marks, 'filter'))).toBe(false)
    expect(existsSync(join(marks, 'hook'))).toBe(false)
  })

  it('diff shows plain added and removed lines with an external diff tool and no prefixes set', async () => {
    const repo = makeRepo()
    git(repo, 'config', 'diff.external', '/bin/false')
    git(repo, 'config', 'diff.noprefix', 'true')
    const store = await open(repo)
    const before = await store.snapshot()
    writeFileSync(join(repo, 'a.txt'), 'ONE\ntwo\n')
    const after = await store.snapshot()
    const patch = await store.diff(before, after, 'a.txt')
    expect(patch).toContain('\n-one\n')
    expect(patch).toContain('\n+ONE\n')
  })
})

describe('parseChanges', () => {
  it('reads the -z outputs, with the new blob as the id, or the old one for a deleted file', () => {
    const [old, now, none] = ['a', 'b', '0'].map((c) => c.repeat(40))
    const raw = [
      `:100644 100644 ${old} ${now} M`,
      'a.txt',
      `:000000 100644 ${none} ${now} A`,
      'b c.txt',
      `:100644 000000 ${old} ${none} D`,
      'gone.txt',
      '',
    ].join('\0')
    const numstat = ['1\t1\ta.txt', '-\t-\tb c.txt', '0\t3\tgone.txt', ''].join('\0')
    expect(parseChanges(raw, numstat)).toEqual([
      { path: 'a.txt', id: now, kind: 'modified', added: 1, removed: 1, binary: false },
      { path: 'b c.txt', id: now, kind: 'added', added: 0, removed: 0, binary: true },
      { path: 'gone.txt', id: old, kind: 'deleted', added: 0, removed: 3, binary: false },
    ])
  })
})

describe('createReviewDir', () => {
  it('clears runs whose process is gone', () => {
    const base = temp('bp-user-')
    const old = join(base, 'review-999999999-old')
    const live = join(base, `review-${process.pid}-live`)
    const other = join(base, 'other')
    for (const d of [old, live, other]) mkdirSync(d)
    const review = createReviewDir(base)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(live)).toBe(true)
    expect(existsSync(other)).toBe(true)
    expect(review.dir.startsWith(join(base, `review-${process.pid}-`))).toBe(true)
    expect(statSync(review.dir).mode & 0o777).toBe(0o700)
    review.remove()
    expect(() => review.remove()).not.toThrow()
    expect(existsSync(review.dir)).toBe(false)
  })
})
