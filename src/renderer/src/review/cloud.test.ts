import { expect, it } from 'vitest'
import { cloudPath } from './cloud'

it('draws a closed scalloped outline', () => {
  const d = cloudPath(130, 26, 8)
  expect(d.startsWith('M8 8')).toBe(true)
  expect(d.endsWith(' Z')).toBe(true)
  expect(d.match(/ a/g)).toHaveLength(24)
})
