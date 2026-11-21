/** A scalloped outline of arcs around a w by h box, starting at (pad, pad) and running clockwise. */
export function cloudPath(w: number, h: number, pad: number): string {
  const nx = Math.max(2, Math.round(w / 13))
  const ny = Math.max(1, Math.round(h / 13))
  const sx = w / nx
  const sy = h / ny
  const r = Math.max(sx, sy) * 0.62
  const arc = (dx: number, dy: number): string => ` a${r} ${r} 0 0 1 ${dx} ${dy}`
  let d = `M${pad} ${pad}`
  for (let i = 0; i < nx; i++) d += arc(sx, 0)
  for (let i = 0; i < ny; i++) d += arc(0, sy)
  for (let i = 0; i < nx; i++) d += arc(-sx, 0)
  for (let i = 0; i < ny; i++) d += arc(0, -sy)
  return d + ' Z'
}
