// PROTOTYPE — Tauri backend. Same commands as main.cjs (Electron), so src/app.js runs unchanged.
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State};

struct PtyEntry {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
}

struct AppState {
    ptys: Mutex<HashMap<String, PtyEntry>>,
    repo: String,
    claude: String,
    curl: String,
    shell: String,
    token: String,
    hook_port: u16,
    tmp: PathBuf,
    selftest: bool,
}

fn which(cmd: &str) -> String {
    Command::new("sh")
        .args(["-c", &format!("command -v {cmd}")])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| cmd.to_string())
}

fn resolve_repo() -> String {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    let sandbox = root.join(".sandbox/demo-repo");
    let cand = std::env::var("BLUEPRINT_REPO")
        .map(PathBuf::from)
        .unwrap_or_else(|_| if sandbox.exists() { sandbox } else { std::env::current_dir().unwrap() });
    Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&cand)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| cand.to_string_lossy().to_string())
}

/* ---------- hook bridge ---------- */
fn hook_command(s: &AppState, pane: &str) -> String {
    format!(
        "{} -s -m 2 -o /dev/null -X POST -H 'content-type: application/json' --data-binary @- 'http://127.0.0.1:{}/hook/{}?t={}' || true",
        s.curl, s.hook_port, pane, s.token
    )
}

fn write_settings(s: &AppState, pane: &str) -> Result<String, String> {
    let cmd = hook_command(s, pane);
    let plain = json!([{ "hooks": [{ "type": "command", "command": cmd }] }]);
    let tools = json!([{ "matcher": "*", "hooks": [{ "type": "command", "command": cmd }] }]);
    let v = json!({ "hooks": { "SessionStart": plain, "UserPromptSubmit": plain, "PostToolUse": tools, "Notification": plain, "Stop": plain, "SubagentStop": plain } });
    let f = s.tmp.join(format!("{pane}.settings.json"));
    fs::write(&f, serde_json::to_string_pretty(&v).unwrap()).map_err(|e| e.to_string())?;
    Ok(f.to_string_lossy().to_string())
}

fn start_hook_server(app: AppHandle, token: String) -> u16 {
    let server = tiny_http::Server::http("127.0.0.1:0").expect("hook server");
    let port = server.server_addr().to_ip().expect("ip addr").port();
    thread::spawn(move || {
        for mut req in server.incoming_requests() {
            let url = req.url().to_string();
            let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
            let pane = path.strip_prefix("/hook/").map(|p| p.to_string());
            let token_ok = query.split('&').any(|kv| kv == format!("t={token}"));
            if *req.method() != tiny_http::Method::Post || pane.is_none() || !token_ok {
                let _ = req.respond(tiny_http::Response::empty(404));
                continue;
            }
            let mut body = String::new();
            let _ = req.as_reader().read_to_string(&mut body);
            let _ = req.respond(tiny_http::Response::empty(204));
            let parsed: Value = serde_json::from_str(&body).unwrap_or_else(|_| json!({ "raw": body }));
            let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
            let _ = app.emit("hook", json!({ "pane": pane.unwrap(), "at": at, "body": parsed }));
        }
    });
    port
}

/* ---------- commands ---------- */
#[tauri::command]
fn info(s: State<AppState>) -> Value {
    json!({
        "platform": "tauri",
        "versions": { "tauri": tauri::VERSION },
        "session": std::env::var("XDG_SESSION_TYPE").unwrap_or_default(),
        "repo": s.repo, "claude": s.claude, "hookPort": s.hook_port, "selftest": s.selftest
    })
}

#[tauri::command]
fn pty_spawn(s: State<AppState>, id: String, kind: String, cols: u16, rows: u16, on_data: Channel<String>, on_exit: Channel<i32>) -> Result<Value, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut session_id = Value::Null;
    let mut cmd = if kind == "claude" {
        let sid = uuid::Uuid::new_v4().to_string();
        session_id = json!(sid);
        let settings = write_settings(&s, &id)?;
        let mut c = CommandBuilder::new(&s.claude);
        c.args(["--session-id", sid.as_str(), "--settings", settings.as_str()]);
        c
    } else {
        CommandBuilder::new(&s.shell)
    };
    cmd.cwd(&s.repo);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env_remove("CLAUDECODE");
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let pid = child.process_id();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    thread::spawn(move || {
        let mut buf = vec![0u8; 65536];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    carry.extend_from_slice(&buf[..n]);
                    // keep an incomplete UTF-8 sequence at the end for the next read
                    let cut = match std::str::from_utf8(&carry) {
                        Ok(_) => carry.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => carry.len(),
                    };
                    if cut == 0 { continue; }
                    let text = String::from_utf8_lossy(&carry[..cut]).into_owned();
                    carry.drain(..cut);
                    if on_data.send(text).is_err() { break; }
                }
            }
        }
        let _ = on_exit.send(0);
    });
    s.ptys.lock().unwrap().insert(id, PtyEntry { writer, master: pair.master, child, pid });
    Ok(json!({ "sessionId": session_id }))
}

#[tauri::command]
fn pty_write(s: State<AppState>, id: String, data: String) {
    if let Some(p) = s.ptys.lock().unwrap().get_mut(&id) {
        let _ = p.writer.write_all(data.as_bytes());
        let _ = p.writer.flush();
    }
}

#[tauri::command]
fn pty_resize(s: State<AppState>, id: String, cols: u16, rows: u16) {
    if cols < 2 || rows < 2 { return; }
    if let Some(p) = s.ptys.lock().unwrap().get(&id) {
        let _ = p.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
    }
}

#[tauri::command]
fn pty_kill(s: State<AppState>, id: String) {
    if let Some(mut p) = s.ptys.lock().unwrap().remove(&id) {
        let _ = p.child.kill();
    }
}

fn git(s: &AppState, args: &[&str], temp_index: bool) -> Result<String, String> {
    let mut c = Command::new("git");
    c.args(args).current_dir(&s.repo);
    if temp_index { c.env("GIT_INDEX_FILE", s.tmp.join("snapshot.index")); }
    let o = c.output().map_err(|e| e.to_string())?;
    if !o.status.success() { return Err(String::from_utf8_lossy(&o.stderr).to_string()); }
    Ok(String::from_utf8_lossy(&o.stdout).to_string())
}

fn snapshot(s: &AppState) -> Result<String, String> {
    git(s, &["add", "-A"], true)?;
    Ok(git(s, &["write-tree"], true)?.trim().to_string())
}

#[tauri::command]
async fn git_snapshot(s: State<'_, AppState>) -> Result<String, String> {
    snapshot(&s)
}

#[tauri::command]
async fn git_changes(s: State<'_, AppState>, base: String) -> Result<Value, String> {
    let now = snapshot(&s)?;
    let ns = git(&s, &["diff", "--name-status", "--no-renames", &base, &now], false)?;
    let num = git(&s, &["diff", "--numstat", "--no-renames", &base, &now], false)?;
    let mut counts: HashMap<String, (String, String)> = HashMap::new();
    for l in num.lines() {
        let p: Vec<&str> = l.split('\t').collect();
        if p.len() == 3 { counts.insert(p[2].to_string(), (p[0].to_string(), p[1].to_string())); }
    }
    let files: Vec<Value> = ns
        .lines()
        .filter_map(|l| {
            let p: Vec<&str> = l.split('\t').collect();
            if p.len() < 2 { return None; }
            let (a, d) = counts.get(p[1]).cloned().unwrap_or(("0".into(), "0".into()));
            Some(json!({ "status": p[0], "path": p[1], "add": a, "del": d }))
        })
        .collect();
    Ok(json!({ "now": now, "files": files }))
}

#[tauri::command]
async fn git_diff(s: State<'_, AppState>, base: String, now: String, path: String) -> Result<String, String> {
    git(&s, &["diff", "--no-color", "--no-renames", &base, &now, "--", &path], false)
}

/// Memory of the app's own process tree (WebKit processes included; shells and claude excluded).
#[tauri::command]
async fn metrics(s: State<'_, AppState>) -> Result<Value, String> {
    let mut kids: HashMap<u32, Vec<u32>> = HashMap::new();
    for e in fs::read_dir("/proc").map_err(|e| e.to_string())?.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(pid) = name.parse::<u32>() else { continue };
        let Ok(stat) = fs::read_to_string(format!("/proc/{pid}/stat")) else { continue };
        let Some(idx) = stat.rfind(')') else { continue };
        let ppid = stat[idx + 2..].split(' ').nth(1).and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
        kids.entry(ppid).or_default().push(pid);
    }
    let skip: HashSet<u32> = s.ptys.lock().unwrap().values().filter_map(|p| p.pid).collect();
    let mut all = vec![];
    let mut stack = vec![std::process::id()];
    while let Some(p) = stack.pop() {
        if skip.contains(&p) { continue; }
        all.push(p);
        if let Some(k) = kids.get(&p) { stack.extend(k.iter().copied()); }
    }
    let mut kb: u64 = 0;
    for p in &all {
        if let Ok(st) = fs::read_to_string(format!("/proc/{p}/status")) {
            if let Some(line) = st.lines().find(|l| l.starts_with("VmRSS:")) {
                kb += line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
            }
        }
    }
    Ok(json!({ "rssMB": kb / 1024, "processes": all.len() }))
}

#[tauri::command]
async fn selftest_hook(s: State<'_, AppState>) -> Result<i32, String> {
    let mut child = Command::new("sh")
        .args(["-c", &hook_command(&s, "selftest")])
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(br#"{"hook_event_name":"SelfTest","session_id":"selftest"}"#)
        .map_err(|e| e.to_string())?;
    let status = child.wait().map_err(|e| e.to_string())?;
    Ok(status.code().unwrap_or(-1))
}

#[tauri::command]
fn report(app: AppHandle, results: Value) {
    println!("SELFTEST_RESULT {results}");
    let ok = results.get("pass").and_then(|v| v.as_bool()).unwrap_or(false);
    app.exit(if ok { 0 } else { 1 });
}

fn main() {
    let tmp = std::env::temp_dir().join(format!("blueprint-proto-tauri-{}", std::process::id()));
    fs::create_dir_all(&tmp).expect("temp dir");
    let token = uuid::Uuid::new_v4().simple().to_string();
    tauri::Builder::default()
        .setup(move |app| {
            let port = start_hook_server(app.handle().clone(), token.clone());
            app.manage(AppState {
                ptys: Mutex::new(HashMap::new()),
                repo: resolve_repo(),
                claude: which("claude"),
                curl: which("curl"),
                shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()),
                token: token.clone(),
                hook_port: port,
                tmp: tmp.clone(),
                selftest: std::env::var("PROTO_SELFTEST").map(|v| v == "1").unwrap_or(false),
            });
            // Create the window only after the state exists, so the page's first invoke() finds it.
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title("Blueprint prototype (Tauri)")
                .inner_size(1600.0, 960.0)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            info, pty_spawn, pty_write, pty_resize, pty_kill, git_snapshot, git_changes, git_diff, metrics, selftest_hook, report
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri prototype");
}
