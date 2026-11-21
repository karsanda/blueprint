import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { findExecutable } from './find'

let tmp = ''
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'blueprint-find-'))
})

function file(dir: string, name: string, mode: number): string {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, '#!/bin/sh\n')
  chmodSync(path, mode)
  return path
}

test('finds an executable on PATH', () => {
  const claude = file(join(tmp, 'bin'), 'claude', 0o755)
  expect(findExecutable('claude', { PATH: `/nowhere:${join(tmp, 'bin')}` })).toBe(claude)
})

test('skips files without the execute bit', () => {
  file(join(tmp, 'a'), 'claude', 0o644)
  const claude = file(join(tmp, 'b'), 'claude', 0o755)
  expect(findExecutable('claude', { PATH: `${join(tmp, 'a')}:${join(tmp, 'b')}` })).toBe(claude)
})

test('falls back to ~/.local/bin when PATH lacks it', () => {
  const claude = file(join(tmp, 'home', '.local', 'bin'), 'claude', 0o755)
  expect(findExecutable('claude', { PATH: '/usr/bin', HOME: join(tmp, 'home') })).toBe(claude)
})

test('returns null when nothing is found', () => {
  expect(findExecutable('claude', { PATH: join(tmp, 'empty'), HOME: join(tmp, 'home') })).toBeNull()
})
