import { expect, test } from 'vitest'
import { resumable } from './resume'

const ID = 'fb8023a7-89b0-439e-9c07-2d3254e55395'
const OTHER = '11111111-2222-4333-8444-555555555555'
const DIR = '/home/d/.claude/projects/-w-p/'
const T = DIR + ID + '.jsonl'

test('a session id with its transcript can be resumed', () => {
  expect(resumable({ sessionId: ID, transcript: T }, () => true)).toBe(true)
  const upper = ID.toUpperCase()
  expect(resumable({ sessionId: upper, transcript: DIR + upper + '.jsonl' }, () => true)).toBe(true)
})

test('an id that is not a session id cannot', () => {
  for (const id of ['--dangerously-skip-permissions', '', 'abc', ID + ' --x']) {
    expect(resumable({ sessionId: id, transcript: DIR + id + '.jsonl' }, () => true)).toBe(false)
  }
})

test('a transcript named for another session cannot', () => {
  expect(resumable({ sessionId: OTHER, transcript: T }, () => true)).toBe(false)
})

test('a relative transcript cannot', () => {
  expect(resumable({ sessionId: ID, transcript: ID + '.jsonl' }, () => true)).toBe(false)
})

test('a missing transcript cannot', () => {
  expect(resumable({ sessionId: ID, transcript: T }, () => false)).toBe(false)
})

test('anything else cannot', () => {
  for (const v of [null, 'x', { sessionId: ID }, { sessionId: 1, transcript: T }]) {
    expect(resumable(v, () => true)).toBe(false)
  }
})
