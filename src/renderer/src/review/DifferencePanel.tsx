import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FileDiff } from '../../../shared/api'
import { cloudPath } from './cloud'
import { type DiffRow, parsePatch } from './diff'
import { highlightLines, type Token } from './highlight'
import { useReview } from './store'

const SIGN = { hunk: '', context: ' ', add: '+', del: '−' } as const
const PAD = 8
const INSET = 4

type Shown =
  | { kind: 'empty' }
  | { kind: 'binary' }
  | { kind: 'text'; path: string; patch: string; byClaude: boolean }

/** The picked Change's difference, with a revision cloud around each block Claude changed. */
export function DifferencePanel() {
  const picked = useReview((s) => s.picked)
  const state = useReview((s) => s.state)
  const [shown, setShown] = useState<Shown>({ kind: 'empty' })

  // Asked again on every review update, so the difference follows a file that changes again.
  useEffect(() => {
    let current = true
    if (picked === null) return () => undefined
    window.blueprint.reviewDiff(picked).then(
      (diff: FileDiff) => {
        if (!current) return
        setShown(
          diff.kind === 'text'
            ? { kind: 'text', path: picked, patch: diff.patch, byClaude: diff.byClaude }
            : diff.kind === 'binary'
              ? { kind: 'binary' }
              : { kind: 'empty' },
        )
      },
      () => undefined,
    )
    return () => {
      current = false
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a review update means ask again
  }, [picked, state])

  return (
    <div className="bp-changes bp-diff" data-tab="difference">
      {picked === null || shown.kind === 'empty' ? (
        <p className="bp-changes-note">Pick a change to see its difference.</p>
      ) : shown.kind === 'binary' ? (
        <p className="bp-changes-note">Binary file.</p>
      ) : (
        <TextDiff path={shown.path} patch={shown.patch} byClaude={shown.byClaude} />
      )}
    </div>
  )
}

function TextDiff({ path, patch, byClaude }: { path: string; patch: string; byClaude: boolean }) {
  const rows = useMemo(() => parsePatch(patch), [patch])
  const tokens = useHighlight(path, rows)
  const out: ReactNode[] = []
  for (let i = 0; i < rows.length;) {
    const block = rows[i].block
    let j = i + 1
    if (block !== null) while (j < rows.length && rows[j].block === block) j++
    const group = rows.slice(i, j).map((row, k) => <Row key={i + k} row={row} tokens={tokens?.get(row)} />)
    out.push(
      block === null ? (
        group
      ) : (
        <Block key={`b${i}`} byClaude={byClaude}>
          {group}
        </Block>
      ),
    )
    i = j
  }
  return (
    <>
      <div className="bp-diff-path">{path}</div>
      <div className="bp-diff-rows">{out}</div>
    </>
  )
}

/** Highlighted tokens per row, once the language is loaded. Rows stay plain until then. */
function useHighlight(path: string, rows: DiffRow[]): Map<DiffRow, Token[]> | null {
  const [result, setResult] = useState<{ rows: DiffRow[]; lines: Token[][] } | null>(null)
  useEffect(() => {
    let current = true
    const code = rows.filter((r) => r.kind !== 'hunk')
    void highlightLines(
      path,
      code.map((r) => r.text),
    ).then(
      (lines) => {
        if (current && lines) setResult({ rows: code, lines })
      },
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [path, rows])
  if (result === null) return null
  const map = new Map<DiffRow, Token[]>()
  result.rows.forEach((r, i) => {
    const line = result.lines[i]
    if (line) map.set(r, line)
  })
  return map
}

function Row({ row, tokens }: { row: DiffRow; tokens: Token[] | undefined }) {
  return (
    <div className="bp-diff-row" data-kind={row.kind}>
      <span className="bp-diff-num">{row.oldLine ?? ''}</span>
      <span className="bp-diff-num">{row.newLine ?? ''}</span>
      <span className="bp-diff-sign">{SIGN[row.kind]}</span>
      <span className="bp-diff-text">
        {row.kind === 'hunk'
          ? row.text
          : tokens
            ? tokens.map((t, i) => (
                <span key={i} style={t.color ? { color: t.color } : undefined}>
                  {t.text}
                </span>
              ))
            : row.text}
      </span>
    </div>
  )
}

/** One change block. When Claude made it, a scalloped cloud is drawn round it and redrawn on resize. */
function Block({ byClaude, children }: { byClaude: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    const cloud = svg.current
    if (!byClaude || !el || !cloud) return () => undefined
    const draw = (): void => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return
      const W = w + INSET * 2
      const H = h + INSET * 2
      cloud.setAttribute('width', String(W + PAD * 2))
      cloud.setAttribute('height', String(H + PAD * 2))
      cloud.setAttribute('viewBox', `0 0 ${W + PAD * 2} ${H + PAD * 2}`)
      cloud.style.left = `${-(INSET + PAD)}px`
      cloud.style.top = `${-(INSET + PAD)}px`
      cloud.querySelector('path')?.setAttribute('d', cloudPath(W, H, PAD))
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    return () => observer.disconnect()
  }, [byClaude])
  return (
    <div className="bp-chg" ref={box}>
      {byClaude && (
        <svg className="bp-cloud" ref={svg} aria-hidden="true">
          <path d="" />
        </svg>
      )}
      {children}
    </div>
  )
}
