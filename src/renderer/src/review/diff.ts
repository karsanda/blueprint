export interface DiffRow {
  kind: 'hunk' | 'context' | 'add' | 'del'
  oldLine: number | null
  newLine: number | null
  text: string
  /** The change block this row belongs to (numbered from 0), or null outside a block. */
  block: number | null
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Reads one file's unified patch into rows. Each unbroken run of added and removed rows is one block. */
export function parsePatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldLine = 0
  let newLine = 0
  let block = -1
  let inBlock = false
  let started = false
  const lines = patch.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  for (const line of lines) {
    const hunk = HUNK.exec(line)
    if (hunk) {
      started = true
      inBlock = false
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      rows.push({ kind: 'hunk', oldLine: null, newLine: null, text: line, block: null })
      continue
    }
    if (!started || line.startsWith('\\')) continue
    const sign = line[0]
    const text = line.slice(1)
    if (sign === '+' || sign === '-') {
      if (!inBlock) block += 1
      inBlock = true
      rows.push(
        sign === '+'
          ? { kind: 'add', oldLine: null, newLine: newLine++, text, block }
          : { kind: 'del', oldLine: oldLine++, newLine: null, text, block },
      )
    } else {
      inBlock = false
      rows.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, text, block: null })
    }
  }
  return rows
}
