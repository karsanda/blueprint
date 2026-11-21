import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WindowBounds } from '../../shared/api'

export interface SavedLayout {
  version: 1
  folder: string
  /** The value of dockview's `toJSON()`. Main treats it as opaque. */
  dockview?: unknown
  window?: WindowBounds
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The file that keeps this Folder's layout: `<userData>/layouts/<16 hex of sha256(folder)>.json`. */
export function layoutFile(userData: string, folder: string): string {
  const name = createHash('sha256').update(folder).digest('hex').slice(0, 16)
  return join(userData, 'layouts', `${name}.json`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validWindow(value: unknown): WindowBounds | undefined {
  if (!isRecord(value)) return undefined
  const { x, y, width, height, maximized } = value
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return undefined
  return { x, y, width, height, maximized: maximized === true }
}

/** Reads a saved layout, or `null` when the file is missing or not one Blueprint wrote. */
export function readLayout(file: string): SavedLayout | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const record = parsed
  if (record.version !== 1) return null
  const layout: SavedLayout = { version: 1, folder: typeof record.folder === 'string' ? record.folder : '' }
  if (record.dockview !== undefined) layout.dockview = record.dockview
  const window = validWindow(record.window)
  if (window) layout.window = window
  return layout
}

/** Merges the patch into the saved layout and writes it whole to `<file>.tmp`, then renames it over the old one. */
export function writeLayout(
  file: string,
  folder: string,
  patch: { dockview?: unknown; window?: WindowBounds },
): void {
  const layout: SavedLayout = { ...(readLayout(file) ?? { version: 1, folder }), folder }
  if (patch.dockview !== undefined) layout.dockview = patch.dockview
  if (patch.window !== undefined) layout.window = patch.window
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(layout))
  renameSync(temp, file)
}

const MIN_VISIBLE = 100

function overlaps(bounds: Rect, area: Rect): boolean {
  const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const height = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  return width >= MIN_VISIBLE && height >= MIN_VISIBLE
}

/** The saved bounds when at least 100 × 100 px of them are on a work area, none otherwise. */
export function initialWindow(
  saved: WindowBounds | undefined,
  workAreas: Rect[],
): { bounds?: Rect; maximized: boolean } {
  if (!saved) return { maximized: false }
  const { x, y, width, height, maximized } = saved
  const bounds = { x, y, width, height }
  return workAreas.some((area) => overlaps(bounds, area)) ? { bounds, maximized } : { maximized }
}
