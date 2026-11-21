// PROTOTYPE — Electron backend. Throwaway; see README.md.
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { execFile, execFileSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const pty = require('node-pty');

app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SELFTEST = process.env.PROTO_SELFTEST === '1';
const PAGE = process.env.PROTO_PAGE === 'looks' ? 'looks' : 'index';
const SHOTS = process.env.PROTO_SHOTS ? path.resolve(ROOT, process.env.PROTO_SHOTS) : '';
const which = (cmd) => { try { return execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim(); } catch { return ''; } };
function resolveRepo() {
  const sandbox = path.join(ROOT, '.sandbox', 'demo-repo');
  const cand = process.env.BLUEPRINT_REPO || (fs.existsSync(sandbox) ? sandbox : process.cwd());
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: cand, encoding: 'utf8' }).trim(); } catch { return cand; }
}
const REPO = resolveRepo();
const CLAUDE = which('claude') || 'claude';
const CURL = which('curl') || 'curl';
const SHELL = process.env.SHELL || '/bin/bash';
const TOKEN = crypto.randomBytes(12).toString('hex');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-proto-'));
const IDX = path.join(TMP, 'snapshot.index');
let hookPort = 0;
let win = null;
const ptys = new Map();

/* ---------- hook bridge: Claude Code hooks POST their JSON here ---------- */
const hookCommand = (paneId) => `${CURL} -s -m 2 -o /dev/null -X POST -H 'content-type: application/json' --data-binary @- 'http://127.0.0.1:${hookPort}/hook/${paneId}?t=${TOKEN}' || true`;
function writeSettings(paneId) {
  const plain = [{ hooks: [{ type: 'command', command: hookCommand(paneId) }] }];
  const tools = [{ matcher: '*', hooks: [{ type: 'command', command: hookCommand(paneId) }] }];
  const settings = { hooks: { SessionStart: plain, UserPromptSubmit: plain, PostToolUse: tools, Notification: plain, Stop: plain, SubagentStop: plain } };
  const file = path.join(TMP, `${paneId}.settings.json`);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return file;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const m = u.pathname.match(/^\/hook\/([\w-]+)$/);
  if (req.method !== 'POST' || !m || u.searchParams.get('t') !== TOKEN) { res.writeHead(404).end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let json; try { json = JSON.parse(body); } catch { json = { raw: body }; }
    res.writeHead(204).end();
    if (win) win.webContents.send('hook', { pane: m[1], at: Date.now(), body: json });
  });
});

/* ---------- git snapshots via a temporary index ---------- */
const git = (args, env = {}) => new Promise((resolve, reject) => {
  execFile('git', args, { cwd: REPO, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error(err || e.message)) : resolve(out)));
});
async function snapshot() {
  await git(['add', '-A'], { GIT_INDEX_FILE: IDX });
  return (await git(['write-tree'], { GIT_INDEX_FILE: IDX })).trim();
}
async function changes(base) {
  const now = await snapshot();
  const ns = (await git(['diff', '--name-status', '--no-renames', base, now])).trim();
  const num = (await git(['diff', '--numstat', '--no-renames', base, now])).trim();
  const counts = {};
  for (const l of num ? num.split('\n') : []) { const [a, d, p] = l.split('\t'); counts[p] = { add: a, del: d }; }
  const files = (ns ? ns.split('\n') : []).map((l) => { const [status, p] = l.split('\t'); return { status, path: p, add: counts[p] ? counts[p].add : 0, del: counts[p] ? counts[p].del : 0 }; });
  return { now, files };
}

/* ---------- memory of the app's own process tree (shells and claude excluded) ---------- */
function metrics() {
  const kids = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const ppid = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(+d); } catch {}
  }
  const skip = new Set([...ptys.values()].map((p) => p.pid));
  const all = []; const stack = [process.pid];
  while (stack.length) { const p = stack.pop(); if (skip.has(p)) continue; all.push(p); (kids.get(p) || []).forEach((k) => stack.push(k)); }
  let kb = 0;
  for (const p of all) { try { kb += +((fs.readFileSync(`/proc/${p}/status`, 'utf8').match(/VmRSS:\s+(\d+)/) || [0, 0])[1]); } catch {} }
  return { rssMB: Math.round(kb / 1024), processes: all.length };
}

/* ---------- IPC ---------- */
ipcMain.handle('info', () => ({ platform: 'electron', versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, session: process.env.XDG_SESSION_TYPE, repo: REPO, claude: CLAUDE, hookPort, selftest: SELFTEST, shots: !!SHOTS, root: ROOT }));
ipcMain.handle('pty:spawn', (_e, { id, kind, cols, rows }) => {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  let file = SHELL, args = [], sessionId = null;
  if (kind === 'claude') { sessionId = crypto.randomUUID(); file = CLAUDE; args = ['--session-id', sessionId, '--settings', writeSettings(id)]; }
  const p = pty.spawn(file, args, { name: 'xterm-256color', cols: Math.max(2, cols | 0), rows: Math.max(2, rows | 0), cwd: REPO, env });
  ptys.set(id, p);
  p.onData((d) => { if (win) win.webContents.send('pty:data', id, d); });
  p.onExit(({ exitCode }) => { ptys.delete(id); if (win) win.webContents.send('pty:exit', id, exitCode); });
  return { sessionId };
});
ipcMain.on('pty:write', (_e, id, d) => { const p = ptys.get(id); if (p) p.write(d); });
ipcMain.on('pty:resize', (_e, id, c, r) => { const p = ptys.get(id); if (p && c > 1 && r > 1) { try { p.resize(c, r); } catch {} } });
ipcMain.on('pty:kill', (_e, id) => { const p = ptys.get(id); if (p) { ptys.delete(id); try { p.kill(); } catch {} } });
ipcMain.handle('git:snapshot', () => snapshot());
ipcMain.handle('git:changes', (_e, base) => changes(base));
ipcMain.handle('git:diff', (_e, base, now, file) => git(['diff', '--no-color', '--no-renames', base, now, '--', file]));
ipcMain.handle('metrics', () => metrics());
ipcMain.handle('selftest:hook', () => new Promise((resolve) => {
  const child = spawn('sh', ['-c', hookCommand('selftest')]);
  child.on('exit', (code) => resolve(code));
  child.stdin.end(JSON.stringify({ hook_event_name: 'SelfTest', session_id: 'selftest' }));
}));
ipcMain.handle('report', (_e, results) => {
  console.log('SELFTEST_RESULT ' + JSON.stringify(results));
  setTimeout(() => app.exit(results && results.pass ? 0 : 1), 100);
});

/* ---------- window ---------- */
app.whenReady().then(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  hookPort = server.address().port;
  protocol.handle('app', (req) => {
    const p = path.normalize(path.join(DIST, decodeURIComponent(new URL(req.url).pathname)));
    if (!p.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(p).toString());
  });
  win = new BrowserWindow({ width: 1600, height: 960, backgroundColor: '#163b6a', title: 'Blueprint prototype (Electron)', webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  if (SELFTEST) win.webContents.on('console-message', (_e, ...args) => { const m = args.find((a) => typeof a === 'string') || (args[0] && args[0].message); if (m) console.log('[renderer]', m); });
  win.loadURL(`app://bundle/${PAGE}.html`);
  if (SHOTS) takeShots();
});

/* ---------- screenshot mode for the looks page: one PNG per variant, sandbox repo only ---------- */
async function takeShots() {
  const shotsRepo = path.join(ROOT, '.sandbox', 'shots-repo');
  if (REPO !== shotsRepo) { console.error('PROTO_SHOTS only runs against .sandbox/shots-repo'); app.exit(1); return; }
  fs.mkdirSync(SHOTS, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  for (let i = 0; i < 100 && !(await js('window.__shotsReady === true')); i++) await wait(200);
  for (const v of ['blueprint-default', 'blueprint-light', 'blueprint-dark', 'riso-light', 'riso-dark', 'riso-custom']) {
    await js(`window.__setVariant(${JSON.stringify(v)})`);
    await wait(1200);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, `${v}.png`), img.toPNG());
    console.log('SHOT', path.join(SHOTS, `${v}.png`));
  }
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'demo-revert.sh')], { cwd: REPO }); } catch (e) { console.error('revert failed', e.message); }
  app.exit(0);
}
app.on('window-all-closed', () => { for (const p of ptys.values()) { try { p.kill(); } catch {} } app.quit(); });
app.on('quit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });
