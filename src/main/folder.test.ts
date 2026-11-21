import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { resolveFolder } from './folder'

let tmp = ''
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'blueprint-folder-'))
  mkdirSync(join(tmp, 'proj'))
  writeFileSync(join(tmp, 'note.txt'), 'x')
})

test('takes the folder after the app entry when not packaged', () => {
  expect(
    resolveFolder(['/e/electron', '--inspect=0', 'out/main/index.js', '--no-sandbox', 'proj'], {
      packaged: false,
      cwd: tmp,
    }),
  ).toEqual({ folder: join(tmp, 'proj') })
})

test('takes the first argument when packaged', () => {
  expect(resolveFolder(['/opt/blueprint', join(tmp, 'proj')], { packaged: true, cwd: '/' })).toEqual({
    folder: join(tmp, 'proj'),
  })
})

test('no folder argument gives no folder', () => {
  expect(resolveFolder(['/e/electron', '.'], { packaged: false, cwd: tmp })).toEqual({ folder: null })
})

test('a missing path or a file is a problem', () => {
  expect(resolveFolder(['/opt/blueprint', 'nope'], { packaged: true, cwd: tmp })).toEqual({
    folder: null,
    problem: `Not a folder: ${join(tmp, 'nope')}`,
  })
  expect(resolveFolder(['/opt/blueprint', 'note.txt'], { packaged: true, cwd: tmp })).toEqual({
    folder: null,
    problem: `Not a folder: ${join(tmp, 'note.txt')}`,
  })
})
