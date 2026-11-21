// PROTOTYPE — throwaway. Answers three questions; see README.md.
// Same file runs inside Electron and Tauri; only backend.js differs underneath.
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon as XFit } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import * as Ghostty from 'ghostty-web';
import { Terminal as ResttyTerminal } from 'restty/xterm';
import { backend } from './backend.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const FONT = '"JetBrains Mono", "Cascadia Mono", "DejaVu Sans Mono", monospace';
const THEME = {
  background: '#0b2547', foreground: '#e6f0ff', cursor: '#ffd166', cursorAccent: '#0b2547', selectionBackground: '#2c5a94',
  black: '#0b1a33', red: '#ff8a7a', green: '#8fdc9c', yellow: '#ffd166', blue: '#7fb4ff', magenta: '#e3a6ff', cyan: '#8fe3f0', white: '#dbe6f5',
  brightBlack: '#5d7aa6', brightRed: '#ffb0a5', brightGreen: '#b6efc0', brightYellow: '#ffe3a0', brightBlue: '#a9cdff', brightMagenta: '#f0c8ff', brightCyan: '#b8f1f8', brightWhite: '#ffffff',
};
const ENGINES = {
  'xterm-webgl': 'xterm.js 6 + WebGL',
  'xterm-dom': 'xterm.js 6 (DOM renderer)',
  'ghostty-web': 'ghostty-web 0.4 (libghostty WASM, canvas)',
  'restty': 'Restty 0.3 (libghostty WASM, WebGPU/WebGL2)',
};

let INFO = {};
const state = { hooks: [], snaps: {}, attribution: {}, changes: { pane: 'A', scope: 'turn', selected: null, now: null }, bench: [] };

/* ---------------- terminal engines behind one tiny interface ---------------- */
let ghosttyInit = null;
async function createEngine(kind, el, onResize) {
  if (kind === 'ghostty-web') {
    ghosttyInit ||= Ghostty.init();
    await ghosttyInit;
    const term = new Ghostty.Terminal({ fontSize: 13, fontFamily: FONT, theme: THEME, cursorBlink: true, scrollback: 5000 });
    const fit = new Ghostty.FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    term.onResize?.((s) => onResize(s.cols, s.rows));
    return { term, renderer: 'canvas 2D', fit: () => { fit.fit(); onResize(term.cols, term.rows); } };
  }
  if (kind === 'restty') {
    const term = new ResttyTerminal({});
    term.open(el);
    term.onResize((s) => onResize(s.cols, s.rows));
    return { term, renderer: navigator.gpu ? 'WebGPU (WebGL2 fallback)' : 'WebGL2 (no WebGPU here)', fit: () => onResize(term.cols, term.rows) };
  }
  const term = new XTerm({ fontSize: 13, fontFamily: FONT, theme: THEME, cursorBlink: true, scrollback: 5000, allowProposedApi: true });
  const fit = new XFit();
  term.loadAddon(fit);
  term.open(el);
  const eng = { term, renderer: 'DOM', fit: () => { fit.fit(); onResize(term.cols, term.rows); } };
  if (kind === 'xterm-webgl') {
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => { gl.dispose(); eng.renderer = 'DOM (WebGL context lost)'; });
      term.loadAddon(gl);
      eng.renderer = 'WebGL';
    } catch (e) { eng.renderer = 'DOM (WebGL failed: ' + e.message + ')'; }
  }
  fit.fit();
  return eng;
}

/* ---------------- panes ---------------- */
const panes = {};
let ptySeq = 0;
class Pane {
  constructor(label, engine, kind) {
    this.label = label; this.engine = engine; this.kind = kind; this.bytes = 0; this.id = null; this.eng = null; this.sessionId = null;
    this.root = document.createElement('section');
    this.root.className = 'pane';
    this.root.innerHTML = `
      <div class="phead"><b>Pane ${label}</b>
        <select class="eng">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}"${k === engine ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <select class="kind"><option value="claude"${kind === 'claude' ? ' selected' : ''}>claude</option><option value="shell"${kind === 'shell' ? ' selected' : ''}>shell</option></select>
        <button class="restart">Restart</button><button class="bench">Benchmark</button></div>
      <div class="pstat"></div>
      <div class="term"></div>`;
    $('.eng', this.root).onchange = (e) => { this.engine = e.target.value; this.start(); };
    $('.kind', this.root).onchange = (e) => { this.kind = e.target.value; this.start(); };
    $('.restart', this.root).onclick = () => this.start();
    $('.bench', this.root).onclick = () => runBenchmark(this);
    new ResizeObserver(() => this.eng && this.eng.fit()).observe($('.term', this.root));
  }
  status() {
    $('.pstat', this.root).textContent = this.eng
      ? `${ENGINES[this.engine]}  ·  renderer: ${this.eng.renderer}  ·  ${this.eng.term.cols}×${this.eng.term.rows}  ·  ${(this.bytes / 1024).toFixed(0)} KB in` + (this.sessionId ? `  ·  session ${this.sessionId.slice(0, 8)}` : '')
      : 'stopped';
  }
  async start() {
    if (this.id) backend.ptyKill(this.id);
    if (this.eng) { try { this.eng.term.dispose(); } catch (e) {} }
    const host = $('.term', this.root);
    host.innerHTML = '';
    this.bytes = 0; this.sessionId = null;
    const id = `${this.label}${++ptySeq}`;
    this.id = id;
    this.eng = await createEngine(this.engine, host, (c, r) => { if (this.id === id && c > 0 && r > 0) backend.ptyResize(id, c, r); this.status(); });
    this.eng.term.onData((d) => backend.ptyWrite(id, d));
    const cols = this.eng.term.cols || 100, rows = this.eng.term.rows || 30;
    const res = await backend.ptySpawn({ id, kind: this.kind, cols, rows });
    this.sessionId = res && res.sessionId;
    if (this.kind === 'claude') {
      state.snaps[this.label] = { session: await backend.gitSnapshot(), turns: [] };
      renderChanges();
    }
    this.status();
  }
}
backend.onPtyData((id, data) => {
  const p = Object.values(panes).find((x) => x.id === id);
  if (!p) return;
  p.bytes += data.length;
  p.eng.term.write(data);
  if (p.bytes % 50 < 2) p.status();
});
backend.onPtyExit((id, code) => {
  const p = Object.values(panes).find((x) => x.id === id);
  if (p) p.eng.term.write(`\r\n\x1b[33m[process exited with code ${code}. Press Restart.]\x1b[0m\r\n`);
});

/* ---------------- hooks ---------------- */
function paneForPty(ptyId) { return Object.values(panes).find((p) => p.id === ptyId); }
backend.onHook(async (evt) => {
  const b = evt.body || {};
  const p = paneForPty(evt.pane);
  const name = b.hook_event_name || '?';
  const file = b.tool_input && (b.tool_input.file_path || b.tool_input.notebook_path);
  state.hooks.unshift({ at: evt.at, pane: p ? p.label : evt.pane, name, tool: b.tool_name, file, msg: b.message || (b.prompt && b.prompt.slice(0, 60)) });
  state.hooks.length = Math.min(state.hooks.length, 60);
  if (p && name === 'UserPromptSubmit') {
    state.snaps[p.label] ||= { session: null, turns: [] };
    state.snaps[p.label].turns.push(await backend.gitSnapshot());
  }
  if (p && file) state.attribution[file.replace(INFO.repo + '/', '')] = 'Claude ' + p.label;
  renderHooks();
  if (['UserPromptSubmit', 'PostToolUse', 'Stop'].includes(name)) renderChanges();
});
function renderHooks() {
  $('#hookcount').textContent = state.hooks.length;
  $('#hooks').innerHTML = state.hooks.map((h) => `<li><span class="t">${new Date(h.at).toLocaleTimeString()}</span> <b>${esc(h.name)}</b> <i>${esc(h.pane)}</i> ${h.tool ? esc(h.tool) : ''} ${h.file ? `<code>${esc(h.file.replace(INFO.repo + '/', ''))}</code>` : ''} ${h.msg ? `<span class="m">${esc(h.msg)}</span>` : ''}</li>`).join('') || '<li class="empty">No hook events yet. Send Claude a prompt.</li>';
}

/* ---------------- changes (per-turn snapshots) ---------------- */
async function renderChanges() {
  const c = state.changes, s = state.snaps[c.pane];
  const base = s ? (c.scope === 'turn' ? s.turns[s.turns.length - 1] || s.session : s.session) : null;
  $('#snapinfo').textContent = s ? `session ${String(s.session).slice(0, 7)}  ·  ${s.turns.length} turn snapshot(s)  ·  base ${String(base).slice(0, 7)}` : 'Start a claude pane to take a session snapshot.';
  if (!base) { $('#changes').innerHTML = ''; $('#diff').innerHTML = ''; return; }
  let r;
  try { r = await backend.gitChanges(base); } catch (e) { $('#changes').innerHTML = `<li class="empty">${esc(e.message || e)}</li>`; return; }
  c.now = r.now;
  $('#changes').innerHTML = r.files.map((f) => `<li data-path="${esc(f.path)}" class="${f.path === c.selected ? 'sel' : ''}"><b class="st">${f.status}</b> <code>${esc(f.path)}</code> <span class="a">+${f.add}</span> <span class="d">−${f.del}</span> <em>${esc(state.attribution[f.path] || 'other')}</em></li>`).join('') || '<li class="empty">No changes in this scope.</li>';
  for (const li of document.querySelectorAll('#changes li[data-path]')) li.onclick = () => { c.selected = li.dataset.path; renderChanges(); };
  if (c.selected && r.files.some((f) => f.path === c.selected)) {
    const text = await backend.gitDiff(base, r.now, c.selected);
    $('#diff').innerHTML = text.split('\n').map((l) => `<div class="${l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}">${esc(l) || ' '}</div>`).join('');
  } else $('#diff').innerHTML = '<div class="empty">Click a file to see its diff.</div>';
}

/* ---------------- benchmark ---------------- */
let WORKLOAD = null;
function makeWorkload(targetChars = 6_000_000) {
  const words = ['alpha', 'beta', 'δέλτα', '中文字符', 'emoji 🚀', '✔ done', '→ next', 'naïve café'];
  const parts = []; let n = 0, i = 0;
  while (n < targetChars) {
    const line = `\x1b[2m${String(i).padStart(6)}\x1b[0m \x1b[${31 + (i % 7)}m${words[i % words.length]}\x1b[0m \x1b[38;5;${i % 256}m${'█'.repeat(i % 12)}\x1b[0m \x1b[38;2;${i % 255};${(i * 3) % 255};200mtruecolor\x1b[0m ${'lorem ipsum dolor sit amet '.repeat(1 + (i % 4))}\r\n`;
    parts.push(line); n += line.length; i++;
  }
  const text = parts.join('');
  return { text, lines: i, mb: new TextEncoder().encode(text).length / 1e6 };
}
function frameMonitor(t0) {
  let last = performance.now(), worst = 0, long = 0, count = 0, run = true, lastBusy = 0;
  (function loop() { if (!run) return; requestAnimationFrame((t) => { const d = t - last; last = t; count++; if (d > worst) worst = d; if (d > 50) long++; if (d > 22) lastBusy = t - t0; loop(); }); })();
  return { stop: () => { run = false; return { worst: Math.round(worst), long, count, lastBusy }; } };
}
async function runBenchmark(pane) {
  if (!pane.eng) return null;
  WORKLOAD ||= makeWorkload();
  const w = WORKLOAD, t = pane.eng.term;
  const btn = $('.bench', pane.root); btn.disabled = true; btn.textContent = 'Running…';
  await frame();
  const t0 = performance.now();
  const mon = frameMonitor(t0);
  for (let i = 0; i < w.text.length; i += 65536) await new Promise((r) => t.write(w.text.slice(i, i + 65536), r));
  await frame(); await frame();
  const writeMs = performance.now() - t0;
  // Some engines (Restty) call back before processing; keep watching until frames stop being slow.
  await sleep(2000);
  const f = mon.stop();
  const ms = Math.max(writeMs, f.lastBusy);
  const row = { shell: INFO.platform, engine: pane.engine, renderer: pane.eng.renderer, mb: +w.mb.toFixed(1), ms: Math.round(ms), writeMs: Math.round(writeMs), mbps: +(w.mb / (ms / 1000)).toFixed(1), frames: f.count, longFrames: f.long, worstFrameMs: f.worst };
  state.bench.unshift(row);
  renderBench();
  btn.disabled = false; btn.textContent = 'Benchmark';
  return row;
}
function renderBench() {
  $('#bench').innerHTML = state.bench.map((b) => `<tr><td>${b.shell}</td><td>${esc(ENGINES[b.engine])}<br><small>${esc(b.renderer)}</small></td><td>${b.mbps} MB/s</td><td>${b.ms} ms<br><small>write ${b.writeMs} ms</small></td><td>${b.longFrames} / ${b.frames}</td><td>${b.worstFrameMs} ms</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Press Benchmark on a pane.</td></tr>';
}

/* ---------------- top bar: gpu, memory, fps ---------------- */
function gpuInfo() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'WebGL2 unavailable';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL2 (renderer hidden)';
  } catch (e) { return 'WebGL2 error'; }
}
function fpsMeter() {
  let n = 0, t0 = performance.now();
  (function loop() { requestAnimationFrame((t) => { n++; if (t - t0 >= 1000) { $('#fps').textContent = `${n} fps`; n = 0; t0 = t; } loop(); }); })();
}
async function pollMetrics() {
  try { const m = await backend.metrics(); $('#mem').textContent = `app memory ${m.rssMB} MB in ${m.processes} processes (shells and claude excluded)`; } catch (e) {}
  setTimeout(pollMetrics, 2000);
}

/* ---------------- self-test (PROTO_SELFTEST=1) ---------------- */
async function waitFor(fn, ms = 8000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(100); } return null; }
function screenText(pane) {
  const t = pane.eng.term;
  try { const b = t.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) || '') + '\n'; return s; } catch (e) { return ''; }
}
async function selftest() {
  const R = { shell: INFO.platform, versions: INFO.versions, session: INFO.session, gpu: gpuInfo(), repo: INFO.repo, checks: {}, bench: [] };
  const seen = {};
  backend.onPtyData((id, d) => { seen[id] = (seen[id] || '') + d; });
  const engines = ['xterm-webgl', 'ghostty-web', 'restty'];
  const p = panes.A;
  for (const e of engines) {
    p.engine = e; p.kind = 'shell';
    try {
      await p.start();
      await sleep(600);
      backend.ptyWrite(p.id, 'echo BP_$((40+2))\r');
      const ok = await waitFor(() => (seen[p.id] || '').includes('BP_42'));
      R.checks[`pty+${e}`] = { ok: !!ok, renderer: p.eng.renderer, size: `${p.eng.term.cols}x${p.eng.term.rows}`, screenHasOutput: e.startsWith('xterm') ? screenText(p).includes('BP_42') : 'n/a' };
      await sleep(300);
      R.bench.push(await runBenchmark(p));
    } catch (err) { R.checks[`pty+${e}`] = { ok: false, error: String(err && err.message || err) }; }
  }
  // git snapshot + change detection, using the shell in pane A
  try {
    p.engine = 'xterm-webgl'; p.kind = 'shell'; await p.start(); await sleep(500);
    const base = await backend.gitSnapshot();
    backend.ptyWrite(p.id, "printf '// selftest edit\\n' >> src/math.js\r");
    const r = await waitFor(async () => { const c = await backend.gitChanges(base); return c.files.find((f) => f.path === 'src/math.js') ? c : null; });
    const diff = r ? await backend.gitDiff(base, r.now, 'src/math.js') : '';
    R.checks.gitSnapshot = { ok: !!r && diff.includes('+// selftest edit'), base: String(base).slice(0, 7), files: r ? r.files : [] };
    backend.ptyWrite(p.id, 'git checkout -- src/math.js\r');
    await sleep(400);
  } catch (err) { R.checks.gitSnapshot = { ok: false, error: String(err && err.message || err) }; }
  // hook bridge: run the exact curl command a Claude hook would run
  try {
    const got = new Promise((res) => backend.onHook((e) => { if (e.body && e.body.hook_event_name === 'SelfTest') res(e); }));
    await backend.selftestHook();
    const e = await Promise.race([got, sleep(5000).then(() => null)]);
    R.checks.hookBridge = { ok: !!e, pane: e && e.pane };
  } catch (err) { R.checks.hookBridge = { ok: false, error: String(err && err.message || err) }; }
  try { R.memory = await backend.metrics(); } catch (e) {}
  R.pass = Object.values(R.checks).every((c) => c.ok);
  await backend.report(R);
}

/* ---------------- boot ---------------- */
(async function boot() {
  INFO = await backend.info();
  $('#shellinfo').textContent = INFO.platform === 'electron'
    ? `Electron ${INFO.versions.electron} · Chromium ${INFO.versions.chrome}`
    : `Tauri ${INFO.versions.tauri} · ${(navigator.userAgent.match(/AppleWebKit\/[\d.]+/) || ['WebKitGTK'])[0]}`;
  $('#gpu').textContent = 'GPU: ' + gpuInfo();
  $('#sess').textContent = (INFO.session || '?') + (navigator.gpu ? ' · WebGPU available' : ' · no WebGPU');
  $('#repo').textContent = INFO.repo;
  $('#hookport').textContent = `hooks on 127.0.0.1:${INFO.hookPort}`;
  const grid = $('#panes');
  panes.A = new Pane('A', 'xterm-webgl', INFO.selftest ? 'shell' : 'claude');
  panes.B = new Pane('B', 'restty', INFO.selftest ? 'shell' : 'claude');
  grid.append(panes.A.root, panes.B.root);
  $('#cpane').onchange = (e) => { state.changes.pane = e.target.value; state.changes.selected = null; renderChanges(); };
  $('#cscope').onchange = (e) => { state.changes.scope = e.target.value; renderChanges(); };
  $('#crefresh').onclick = () => renderChanges();
  renderHooks(); renderBench(); fpsMeter(); pollMetrics();
  if (INFO.selftest) { await selftest(); return; }
  await panes.A.start();
  await panes.B.start();
  renderChanges();
})();
