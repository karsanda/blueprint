// PROTOTYPE — look tokens for the Blueprint and Riso variants, plus matching xterm.js terminal themes.
// One variant = look + scheme. The Riso "custom" scheme derives everything from one paper color.

export const VARIANTS = ['blueprint-default', 'blueprint-light', 'blueprint-dark', 'riso-light', 'riso-dark', 'riso-custom'];
export const LABELS = {
  'blueprint-default': 'Blueprint · Default',
  'blueprint-light': 'Blueprint · Light',
  'blueprint-dark': 'Blueprint · Dark',
  'riso-light': 'Riso · Light',
  'riso-dark': 'Riso · Dark',
  'riso-custom': 'Riso · Custom paper',
};

// Pane text (terminals, diff, paths) uses Cascadia Code in both looks; the window chrome keeps each look's own face.
const CASCADIA = '"Cascadia Code Variable", "Cascadia Code", ui-monospace, monospace';
const FONTS = {
  blueprint: { ui: '"Overpass", system-ui, sans-serif', mono: CASCADIA, term: CASCADIA },
  riso: { ui: '"Anybody Variable", system-ui, sans-serif', mono: CASCADIA, term: CASCADIA },
};

const ANSI = {
  blueprintDark: { black: '#0b1a33', red: '#ff8a7a', green: '#8fdc9c', yellow: '#ffd166', blue: '#7fb4ff', magenta: '#e3a6ff', cyan: '#8fe3f0', white: '#dbe6f5', brightBlack: '#6d8bb8', brightRed: '#ffb0a5', brightGreen: '#b6efc0', brightYellow: '#ffe3a0', brightBlue: '#a9cdff', brightMagenta: '#f0c8ff', brightCyan: '#b8f1f8', brightWhite: '#ffffff' },
  blueprintLight: { black: '#12305e', red: '#b3262e', green: '#1c7a45', yellow: '#8a5f00', blue: '#1d4f91', magenta: '#8a3fa0', cyan: '#0b6e80', white: '#5b6f8e', brightBlack: '#4f6587', brightRed: '#d0453c', brightGreen: '#2a9a5c', brightYellow: '#a87400', brightBlue: '#2f6bc0', brightMagenta: '#a656c0', brightCyan: '#178aa0', brightWhite: '#0b1f40' },
  risoLight: { black: '#1c1c22', red: '#c8157f', green: '#00875f', yellow: '#9a7400', blue: '#0068a8', magenta: '#e0249a', cyan: '#007f9e', white: '#5b5b66', brightBlack: '#6b6b76', brightRed: '#e0249a', brightGreen: '#00a46f', brightYellow: '#b38900', brightBlue: '#0078bf', brightMagenta: '#ff48b0', brightCyan: '#0096b8', brightWhite: '#1c1c22' },
  risoDark: { black: '#1c1b21', red: '#ff7cc9', green: '#5fd4a0', yellow: '#ffe800', blue: '#63b4ff', magenta: '#ff5cbc', cyan: '#6fd3f0', white: '#d9d6cc', brightBlack: '#7a7884', brightRed: '#ffa3d9', brightGreen: '#8fe6bf', brightYellow: '#fff27a', brightBlue: '#9ccfff', brightMagenta: '#ff8fd1', brightCyan: '#a3e6f7', brightWhite: '#ffffff' },
};

const BASE = {
  'blueprint-default': {
    bg: '#163b6a', sheet: '#0f2c52', sheetA: 'rgba(14,42,79,.92)', grid1: 'rgba(207,227,255,.07)', grid2: 'rgba(207,227,255,.15)',
    chrome: '#dbe9ff', head: '#e3efff', ink: '#e6f0ff', muted: '#a2bde2', line: '#cfe3ff', lineSoft: 'rgba(207,227,255,.5)', lineFaint: 'rgba(207,227,255,.3)', sel: 'rgba(207,227,255,.13)',
    agent: '#ffd166', onAgent: '#0f2c52', you: '#a6d8ff', wait: '#ffa24c', waitBg: '#ffa24c', waitFg: '#0f2c52', ok: '#8fdc9c',
    add: '#8fdc9c', del: '#ff8a7a', addBg: 'rgba(143,220,156,.13)', delBg: 'rgba(255,138,122,.15)', addInk: '#dff7e4', delInk: '#ffe0db',
    ansi: ANSI.blueprintDark, selection: 'rgba(207,227,255,.28)', ground: 'dark',
  },
  'blueprint-dark': {
    bg: '#0d1b2e', sheet: '#081221', sheetA: 'rgba(8,18,33,.94)', grid1: 'rgba(185,203,230,.05)', grid2: 'rgba(185,203,230,.1)',
    chrome: '#cfdcf0', head: '#dbe6f5', ink: '#dbe6f5', muted: '#8fa6c6', line: '#b9cbe6', lineSoft: 'rgba(185,203,230,.45)', lineFaint: 'rgba(185,203,230,.25)', sel: 'rgba(185,203,230,.1)',
    agent: '#ffd166', onAgent: '#0d1b2e', you: '#9cc9f5', wait: '#ffa24c', waitBg: '#ffa24c', waitFg: '#0d1b2e', ok: '#8fdc9c',
    add: '#8fdc9c', del: '#ff8a7a', addBg: 'rgba(143,220,156,.12)', delBg: 'rgba(255,138,122,.14)', addInk: '#d9f3df', delInk: '#ffdcd6',
    ansi: ANSI.blueprintDark, selection: 'rgba(185,203,230,.25)', ground: 'dark',
  },
  'blueprint-light': {
    bg: '#eef2f8', sheet: '#fbfcfe', sheetA: '#fbfcfe', grid1: 'rgba(29,79,145,.07)', grid2: 'rgba(29,79,145,.15)',
    chrome: '#1d4f91', head: '#12305e', ink: '#12305e', muted: '#4f6587', line: '#1d4f91', lineSoft: 'rgba(29,79,145,.45)', lineFaint: 'rgba(29,79,145,.25)', sel: 'rgba(29,79,145,.08)',
    agent: '#b98200', onAgent: '#1a1200', you: '#1d4f91', wait: '#c2410c', waitBg: '#c2410c', waitFg: '#ffffff', ok: '#1c7a45',
    add: '#1c7a45', del: '#b3262e', addBg: 'rgba(28,122,69,.1)', delBg: 'rgba(179,38,46,.1)', addInk: '#13502e', delInk: '#861b22',
    ansi: ANSI.blueprintLight, selection: 'rgba(29,79,145,.2)', ground: 'light',
  },
  'riso-light': {
    bg: '#f3f3ee', sheet: '#fbfbf7', sheetA: '#fbfbf7', dots: 'rgba(255,72,176,.22)',
    chrome: '#1c1c22', head: '#1c1c22', ink: '#1c1c22', muted: '#5b5b66', line: '#1c1c22', lineSoft: 'rgba(28,28,34,.35)', lineFaint: 'rgba(28,28,34,.2)', sel: 'rgba(0,120,191,.11)',
    agent: '#e0249a', onAgent: '#ffffff', you: '#0068a8', wait: '#1c1c22', waitBg: '#ffe800', waitFg: '#1c1c22', ok: '#0068a8',
    add: '#0068a8', del: '#c8157f', addBg: 'rgba(0,120,191,.15)', delBg: 'rgba(255,72,176,.2)', addInk: '#00578d', delInk: '#a3105f',
    shadowA: 'rgba(255,72,176,.85)', shadowB: 'rgba(0,120,191,.7)',
    ansi: ANSI.risoLight, selection: 'rgba(0,120,191,.22)', ground: 'light',
  },
  'riso-dark': {
    bg: '#1c1b21', sheet: '#25242b', sheetA: '#25242b', dots: 'rgba(255,72,176,.17)',
    chrome: '#efece3', head: '#efece3', ink: '#ece9e0', muted: '#a9a6b2', line: '#ece9e0', lineSoft: 'rgba(236,233,224,.35)', lineFaint: 'rgba(236,233,224,.2)', sel: 'rgba(74,168,255,.15)',
    agent: '#ff5cbc', onAgent: '#1c1b21', you: '#63b4ff', wait: '#ffe800', waitBg: '#ffe800', waitFg: '#1c1b21', ok: '#63b4ff',
    add: '#7cc2ff', del: '#ff7cc9', addBg: 'rgba(74,168,255,.18)', delBg: 'rgba(255,72,176,.2)', addInk: '#c4e3ff', delInk: '#ffc2e6',
    shadowA: 'rgba(255,72,176,.8)', shadowB: 'rgba(74,168,255,.7)',
    ansi: ANSI.risoDark, selection: 'rgba(99,180,255,.28)', ground: 'dark',
  },
};

/* ---------- custom paper derivation (same rules as the pitch page) ---------- */
const hexToRgb = (h) => { h = h.replace('#', ''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (c) => '#' + c.map((v) => ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2)).join('');
const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
const lum = (c) => { const s = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
const contrast = (a, b) => { const A = lum(a) + 0.05, B = lum(b) + 0.05; return A > B ? A / B : B / A; };
const rgba = (c, a) => `rgba(${c.map(Math.round).join(',')},${a})`;

function customTokens(paperHex) {
  const base = hexToRgb(paperHex), W = [255, 255, 255];
  const dark = lum(base) < 0.18;
  if (dark) {
    const paper = mix(base, W, 0.07), ink = [241, 239, 230];
    let t = 0.45, muted = mix(paper, W, t);
    while (contrast(muted, paper) < 4.6 && t < 0.95) { t += 0.05; muted = mix(paper, W, t); }
    return { ...BASE['riso-dark'], bg: paperHex, sheet: toHex(paper), sheetA: toHex(paper), dots: 'rgba(255,92,188,.2)', chrome: toHex(ink), head: toHex(ink), ink: toHex(ink), muted: toHex(muted), line: toHex(ink), lineSoft: rgba(ink, 0.35), lineFaint: rgba(ink, 0.2), sel: 'rgba(124,200,255,.16)',
      agent: '#ff6cc4', you: '#7cc8ff', ok: '#7cc8ff', add: '#8fd0ff', del: '#ff8ccf', addBg: 'rgba(124,200,255,.2)', delBg: 'rgba(255,92,188,.22)', addInk: '#d3ecff', delInk: '#ffd0ec', shadowB: 'rgba(124,200,255,.7)',
      ansi: { ...ANSI.risoDark, blue: '#8fd0ff', brightBlue: '#b8e2ff', black: toHex(mix(paper, [0, 0, 0], 0.4)) }, ground: 'dark' };
  }
  const paper = mix(base, W, 0.6), ink = [28, 28, 34];
  let t = 0.5, muted = mix(ink, paper, t);
  while (contrast(muted, paper) < 4.6 && t > 0) { t -= 0.05; muted = mix(ink, paper, t); }
  return { ...BASE['riso-light'], bg: paperHex, sheet: toHex(paper), sheetA: toHex(paper), muted: toHex(muted), ground: 'light' };
}

export function themeFor(variant, paper = '#163b6a') {
  const [skin] = variant.split('-');
  const t = variant === 'riso-custom' ? customTokens(paper) : BASE[variant];
  const f = FONTS[skin];
  const css = {
    '--bg': t.bg, '--sheet': t.sheet, '--sheet-a': t.sheetA, '--grid-1': t.grid1 || 'transparent', '--grid-2': t.grid2 || 'transparent', '--dots': t.dots || 'transparent',
    '--chrome': t.chrome, '--head': t.head, '--ink': t.ink, '--muted': t.muted, '--line': t.line, '--line-soft': t.lineSoft, '--line-faint': t.lineFaint, '--sel': t.sel,
    '--agent': t.agent, '--on-agent': t.onAgent, '--you': t.you, '--wait': t.wait, '--wait-bg': t.waitBg, '--wait-fg': t.waitFg, '--ok': t.ok,
    '--add': t.add, '--del': t.del, '--add-bg': t.addBg, '--del-bg': t.delBg, '--add-ink': t.addInk, '--del-ink': t.delInk,
    '--shadow-a': t.shadowA || 'transparent', '--shadow-b': t.shadowB || 'transparent',
    '--f-ui': f.ui, '--f-mono': f.mono,
  };
  const term = { background: t.sheet, foreground: t.ink, cursor: t.agent, cursorAccent: t.sheet, selectionBackground: t.selection || t.sel, ...t.ansi };
  return { skin, css, term, termFont: f.term, ground: t.ground };
}
