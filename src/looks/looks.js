// PROTOTYPE — Blueprint vs Riso looks on a real workspace: real xterm.js (WebGL) terminals, real Claude
// sessions, real hook events and git snapshots. Variants switch with ?variant= and the floating bar.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import '@fontsource/overpass/400.css';
import '@fontsource/overpass/600.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass/800.css';
import '@fontsource/overpass-mono/400.css';
import '@fontsource/overpass-mono/600.css';
import '@fontsource-variable/anybody/wdth.css';
import '@fontsource-variable/recursive/full.css';
import '@fontsource-variable/cascadia-code/index.css';
import { backend } from '../backend.js';
import { VARIANTS, LABELS, themeFor } from './themes.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

let INFO = {};
const params = new URLSearchParams(location.search);
const S = {
  variant: VARIANTS.includes(params.get('variant')) ? params.get('variant') : 'blueprint-default',
  paper: /^#[0-9a-f]{6}$/i.test(params.get('paper') || '') ? params.get('paper') : '#163b6a',
  theme: null, claudes: [], active: 0, shell: null,
  snaps: { session: null, turns: [] }, attr: {}, scope: 'turn', selected: null, activity: [],
};
S.theme = themeFor(S.variant, S.paper);

/* ---------------- terminals ---------------- */
function makeTerm(host) {
  const el = document.createElement('div');
  el.className = 't';
  host.appendChild(el);
  const term = new Terminal({ fontSize: 13, lineHeight: 1.12, fontFamily: S.theme.termFont, theme: S.theme.term, cursorBlink: true, scrollback: 5000, allowProposedApi: true });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  try { const gl = new WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch (e) { console.warn('WebGL unavailable', e); }
  new ResizeObserver(() => { if (!el.hidden) fit.fit(); }).observe(el);
  fit.fit();
  return { el, term, fit };
}
const allTerms = () => [...S.claudes, S.shell].filter(Boolean);
backend.onPtyData((id, d) => { const t = allTerms().find((x) => x.id === id); if (t) t.term.write(d); });

async function addClaude() {
  const n = S.claudes.length + 1;
  const id = `L${n}x${Date.now() % 100000}`;
  const t = makeTerm($('#claude-terms'));
  const c = { n, label: `Claude ${n}`, id, status: 'idle', ...t };
  S.claudes.push(c);
  t.term.onData((d) => backend.ptyWrite(id, d));
  t.term.onResize(({ cols, rows }) => { backend.ptyResize(id, cols, rows); if (S.claudes[S.active] === c) $('#claude-dim').textContent = `${cols} columns`; });
  selectClaude(S.claudes.length - 1);
  await backend.ptySpawn({ id, kind: INFO.shots ? 'shell' : 'claude', cols: t.term.cols, rows: t.term.rows });
  if (!S.snaps.session) S.snaps.session = await backend.gitSnapshot();
  renderStatus();
  return c;
}
function selectClaude(i) {
  S.active = i;
  S.claudes.forEach((c, j) => { c.el.hidden = j !== i; });
  const c = S.claudes[i];
  requestAnimationFrame(() => { c.fit.fit(); $('#claude-dim').textContent = `${c.term.cols} columns`; });
  $('#tb-claude').textContent = c.label;
  renderStatus();
}
async function startShell() {
  const id = `Lsh${Date.now() % 100000}`;
  const t = makeTerm($('#shell-terms'));
  S.shell = { id, ...t };
  t.term.onData((d) => backend.ptyWrite(id, d));
  t.term.onResize(({ cols, rows }) => backend.ptyResize(id, cols, rows));
  await backend.ptySpawn({ id, kind: 'shell', cols: t.term.cols, rows: t.term.rows });
}

/* ---------------- status, tabs, activity ---------------- */
const STATUS_TEXT = { wait: 'needs you', working: 'working', idle: 'idle' };
function renderStatus() {
  $('#claude-tabs').innerHTML = S.claudes.map((c, i) => `<span class="tab${i === S.active ? ' on' : ''}" data-i="${i}"><i class="dot ${c.status}"></i>${esc(c.label)}</span>`).join('');
  for (const el of document.querySelectorAll('#claude-tabs .tab')) el.onclick = () => selectClaude(+el.dataset.i);
  const c = S.claudes[S.active];
  const st = $('#claude-status');
  st.className = 'status ' + (c ? c.status : 'idle');
  st.textContent = c ? STATUS_TEXT[c.status] : '';
  $('#annuns').innerHTML = S.claudes.map((x) => `<span class="annun ${x.status}">${esc(x.label)} ${STATUS_TEXT[x.status]}</span>`).join('');
}
function pushActivity(who, text, kind = '') {
  S.activity.unshift({ who, text, kind, at: now() });
  S.activity.length = Math.min(S.activity.length, 50);
  $('#alist').innerHTML = S.activity.map((a) => `<li class="arow ${a.kind}"><span><span class="who${a.who === 'You' ? ' you' : ''}">${esc(a.who)}</span> ${esc(a.text)}</span><span class="tm">${a.at}</span></li>`).join('');
}
const rel = (p) => (p || '').replace(INFO.repo + '/', '');

backend.onHook(async (evt) => {
  const c = S.claudes.find((x) => x.id === evt.pane);
  if (!c) return;
  const b = evt.body || {};
  const ev = b.hook_event_name;
  if (ev === 'SessionStart') { c.status = 'idle'; pushActivity(c.label, 'started'); }
  if (ev === 'UserPromptSubmit') {
    c.status = 'working';
    S.snaps.turns.push(await backend.gitSnapshot());
    pushActivity('You', `asked ${c.label}: ${(b.prompt || '').slice(0, 80)}`);
  }
  if (ev === 'PostToolUse') {
    c.status = 'working';
    const file = b.tool_input && (b.tool_input.file_path || b.tool_input.notebook_path);
    if (file) { S.attr[rel(file)] = c.label; pushActivity(c.label, `${b.tool_name === 'Write' ? 'wrote' : 'edited'} ${rel(file)}`); }
    else if (b.tool_name === 'Bash') pushActivity(c.label, `ran ${(b.tool_input && b.tool_input.command || '').slice(0, 60)}`);
  }
  if (ev === 'Notification') { c.status = 'wait'; pushActivity(c.label, `needs you: ${(b.message || '').slice(0, 80)}`, 'wait'); }
  if (ev === 'Stop') { c.status = 'idle'; pushActivity(c.label, 'finished its turn'); }
  renderStatus();
  if (['UserPromptSubmit', 'PostToolUse', 'Stop'].includes(ev)) refreshChanges();
});

/* ---------------- changes and diff ---------------- */
const revLetter = () => String.fromCharCode(64 + Math.max(1, S.snaps.turns.length));
function baseSnapshot() { return S.scope === 'turn' ? (S.snaps.turns[S.snaps.turns.length - 1] || S.snaps.session) : S.snaps.session; }
async function refreshChanges() {
  $('#changes-sub').textContent = S.scope === 'turn' ? 'since your last prompt' : 'since Claude started';
  $('#tb-rev').textContent = revLetter();
  const base = baseSnapshot();
  if (!base) { $('#clist').innerHTML = '<li class="empty">Waiting for Claude to start.</li>'; return; }
  const r = await backend.gitChanges(base);
  if (!S.selected || !r.files.some((f) => f.path === S.selected)) S.selected = r.files[0] ? r.files[0].path : null;
  $('#clist').innerHTML = r.files.map((f) => {
    const who = S.attr[f.path];
    const n = who ? who.replace('Claude ', '') : '';
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : './';
    const name = f.path.slice(f.path.lastIndexOf('/') + 1);
    return `<li class="crow${f.path === S.selected ? ' sel' : ''}" data-path="${esc(f.path)}"><span class="st">${esc(f.status)}</span><span class="nm">${esc(name)}</span>${who ? `<span class="mark" data-n="${n}" title="${esc(who)}">C${n}</span>` : '<span class="mark other" title="Changed outside Claude">sh</span>'}<span class="dir">${esc(dir)}</span><span class="ct"><span class="a">+${f.add}</span> <span class="d">−${f.del}</span></span></li>`;
  }).join('') || `<li class="empty">No changes ${S.scope === 'turn' ? 'since your last prompt' : 'in this session'} yet.<br>Ask Claude to edit something.</li>`;
  for (const li of document.querySelectorAll('#clist .crow')) li.onclick = () => { S.selected = li.dataset.path; refreshChanges(); };
  if (S.selected) {
    const text = await backend.gitDiff(base, r.now, S.selected);
    renderDiff(S.selected, text);
  } else {
    $('#diff').innerHTML = '<div class="empty">No file selected.</div>';
    $('#diff-title').textContent = 'Diff'; $('#diff-sub').textContent = ''; $('#tb-diff').textContent = 'none'; $('#tb-diff-rev').textContent = '–';
  }
}
function renderDiff(path, text) {
  const rev = revLetter();
  $('#diff-title').textContent = path.slice(path.lastIndexOf('/') + 1);
  $('#diff-sub').textContent = S.scope === 'turn' ? 'since your last prompt' : 'since Claude started';
  $('#tb-diff').textContent = path.slice(path.lastIndexOf('/') + 1);
  $('#tb-diff-rev').textContent = rev;
  const row = (a, b, cls, code) => `<div class="drow ${cls}"><span class="ln">${a}</span><span class="ln">${b}</span><span class="sign">${cls === 'add' ? '+' : cls === 'del' ? '−' : ' '}</span><span class="code">${esc(code) || ' '}</span></div>`;
  let html = '', block = '', o = 0, n = 0;
  const flush = () => { if (block) { html += `<div class="chg"><svg class="cloud" aria-hidden="true"><path d=""/></svg><span class="revtag">${rev}</span>${block}</div>`; block = ''; } };
  for (const l of text.split('\n')) {
    if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l) || l === '' || l.startsWith('\\')) continue;
    const m = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (m) { flush(); o = +m[1]; n = +m[2]; html += `<div class="hunkh">${esc(l)}</div>`; continue; }
    if (l[0] === '+') { block += row('', n++, 'add', l.slice(1)); continue; }
    if (l[0] === '-') { block += row(o++, '', 'del', l.slice(1)); continue; }
    flush(); html += row(o++, n++, '', l.slice(1));
  }
  flush();
  $('#diff').innerHTML = html || '<div class="empty">No textual changes.</div>';
  requestAnimationFrame(drawClouds);
}

/* revision clouds: scalloped outlines around each changed block (Blueprint only, hidden by CSS in Riso) */
function cloudPath(w, h, p) {
  const nx = Math.max(2, Math.round(w / 13)), ny = Math.max(1, Math.round(h / 13));
  const sx = w / nx, sy = h / ny, r = Math.max(sx, sy) * 0.62;
  let d = `M${p} ${p}`;
  for (let i = 0; i < nx; i++) d += ` a${r} ${r} 0 0 1 ${sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${r} ${r} 0 0 1 0 ${sy}`;
  for (let i = 0; i < nx; i++) d += ` a${r} ${r} 0 0 1 ${-sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${r} ${r} 0 0 1 0 ${-sy}`;
  return d + ' Z';
}
function drawClouds() {
  for (const ch of document.querySelectorAll('#diff .chg')) {
    const svg = ch.querySelector('.cloud');
    const w = ch.offsetWidth, h = ch.offsetHeight, pad = 8, inset = 4;
    if (!w || !h) continue;
    const W = w + inset * 2, H = h + inset * 2;
    svg.setAttribute('width', W + pad * 2); svg.setAttribute('height', H + pad * 2);
    svg.style.left = -(inset + pad) + 'px'; svg.style.top = -(inset + pad) + 'px';
    svg.setAttribute('viewBox', `0 0 ${W + pad * 2} ${H + pad * 2}`);
    svg.querySelector('path').setAttribute('d', cloudPath(W, H, pad));
  }
}
new ResizeObserver(() => drawClouds()).observe($('#diff'));

/* ---------------- variants ---------------- */
async function applyVariant(v, paper) {
  S.variant = v;
  if (paper) S.paper = paper;
  S.theme = themeFor(v, S.paper);
  const app = $('#app');
  app.dataset.skin = S.theme.skin;
  app.dataset.ground = S.theme.ground;
  for (const [k, val] of Object.entries(S.theme.css)) app.style.setProperty(k, val);
  try { await document.fonts.load(`13px ${S.theme.termFont.split(',')[0]}`); } catch (e) {}
  for (const t of allTerms()) { t.term.options.fontFamily = S.theme.termFont; t.term.options.theme = S.theme.term; if (!t.el.hidden) t.fit.fit(); }
  $('#vlabel').textContent = `${VARIANTS.indexOf(v) + 1}/${VARIANTS.length}  ${LABELS[v]}`;
  $('#paper-ctl').hidden = v !== 'riso-custom';
  $('#paper').value = S.paper; $('#paper-hex').textContent = S.paper;
  const q = new URLSearchParams({ variant: v });
  if (v === 'riso-custom') q.set('paper', S.paper);
  history.replaceState(null, '', '?' + q.toString());
  requestAnimationFrame(drawClouds);
}
const cycle = (d) => applyVariant(VARIANTS[(VARIANTS.indexOf(S.variant) + d + VARIANTS.length) % VARIANTS.length]);
$('#prev').onclick = () => cycle(-1);
$('#next').onclick = () => cycle(1);
$('#paper').oninput = (e) => applyVariant('riso-custom', e.target.value);
window.addEventListener('keydown', (e) => {
  const a = document.activeElement;
  if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)) return;
  if (e.key === 'ArrowLeft') cycle(-1);
  if (e.key === 'ArrowRight') cycle(1);
});
window.__setVariant = (v) => applyVariant(v);

/* ---------------- screenshot mode (PROTO_SHOTS): fake Claude transcript, real git edits in the sandbox ---------------- */
async function shotsPrepare() {
  const root = INFO.root;
  const c1 = S.claudes[0];
  const c2 = await addClaude();
  selectClaude(0);
  await sleep(900);
  backend.ptyWrite(c1.id, `clear; bash '${root}/scripts/demo-claude.sh'\r`);
  backend.ptyWrite(S.shell.id, `clear; bash '${root}/scripts/demo-edit.sh' && bash '${root}/scripts/demo-shell.sh'\r`);
  await sleep(1800);
  S.attr['src/math.js'] = 'Claude 1'; S.attr['src/median.js'] = 'Claude 1'; S.attr['README.md'] = null;
  S.snaps.turns.push(S.snaps.session);
  c1.status = 'wait'; c2.status = 'working';
  pushActivity('Claude 1', 'started');
  pushActivity('You', 'asked Claude 1: fix the bug in average and add a test for empty lists');
  pushActivity('Claude 1', 'edited src/math.js');
  pushActivity('Claude 1', 'wrote src/median.js');
  pushActivity('Claude 2', 'ran pnpm test --filter api');
  pushActivity('Claude 1', 'needs you: Claude wants to run pnpm test', 'wait');
  renderStatus();
  S.selected = 'src/math.js';
  await refreshChanges();
}

/* ---------------- boot ---------------- */
for (const b of document.querySelectorAll('.scopes button')) b.onclick = () => { S.scope = b.dataset.scope; for (const x of document.querySelectorAll('.scopes button')) x.classList.toggle('on', x === b); refreshChanges(); };
$('#add-claude').onclick = () => addClaude();
(async function boot() {
  INFO = await backend.info();
  $('#fname').textContent = INFO.repo.split('/').pop();
  $('#shell-sub').textContent = '~/' + INFO.repo.split('/').pop();
  await applyVariant(S.variant, S.paper);
  await startShell();
  await addClaude();
  refreshChanges();
  if (INFO.shots) { await shotsPrepare(); window.__shotsReady = true; }
})();
