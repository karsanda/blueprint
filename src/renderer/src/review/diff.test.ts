import { describe, expect, it } from 'vitest'
import { parsePatch } from './diff'

const header = 'diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n'

describe('parsePatch', () => {
  it('reads a hunk into numbered rows', () => {
    const rows = parsePatch(`${header}@@ -1,2 +1,2 @@\n-one\n+ONE\n two\n`)
    expect(rows).toEqual([
      { kind: 'hunk', oldLine: null, newLine: null, text: '@@ -1,2 +1,2 @@', block: null },
      { kind: 'del', oldLine: 1, newLine: null, text: 'one', block: 0 },
      { kind: 'add', oldLine: null, newLine: 1, text: 'ONE', block: 0 },
      { kind: 'context', oldLine: 2, newLine: 2, text: 'two', block: null },
    ])
  })

  it('numbers each change block', () => {
    const rows = parsePatch(`${header}@@ -1,5 +1,5 @@\n-a\n+A\n b\n c\n-d\n+D\n`)
    expect(rows.map((r) => r.block)).toEqual([null, 0, 0, null, null, 1, 1])
  })

  it('reads a new file whole', () => {
    const rows = parsePatch(`${header}@@ -0,0 +1,2 @@\n+x\n+y\n`)
    expect(rows.slice(1).map((r) => [r.kind, r.oldLine, r.newLine])).toEqual([
      ['add', null, 1],
      ['add', null, 2],
    ])
  })

  it('skips the no-newline marker', () => {
    const rows = parsePatch(`${header}@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n`)
    expect(rows.map((r) => r.kind)).toEqual(['hunk', 'del', 'add'])
    expect(rows[1]?.block).toBe(0)
    expect(rows[2]?.block).toBe(0)
  })
})
