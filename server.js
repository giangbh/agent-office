// Văn phòng Agent – server nhận sự kiện từ Claude Code hooks và đẩy về trình duyệt (SSE)
// Chạy: node server.js        (thật)
//       node server.js --demo (dữ liệu giả để xem thử)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 4317;
const HOST = process.env.HOST || '127.0.0.1'; // mặc định chỉ nhận từ máy này; đặt HOST=0.0.0.0 để mở cho mạng LAN
const TOKEN = process.env.AGENT_OFFICE_TOKEN || ''; // nếu đặt, POST /event phải kèm header X-Agent-Office-Token
const DEMO = process.argv.includes('--demo');
const DATA_DIR = process.env.AGENT_OFFICE_DATA || __dirname; // nơi lưu state.json và events.jsonl
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const LOG_FILE = path.join(DATA_DIR, 'events.jsonl');
const LOG_MAX = 5 * 1024 * 1024; // vượt mức này thì đổi tên thành events.jsonl.old và bắt đầu file mới
const REPLAY_MAX_EVENTS = 1500;
// Phiên không có sự kiện nào quá STALE_MIN phút bị đánh dấu "im lặng" (stale); quá ABANDON_MIN phút thì coi như đã bỏ và chuyển về rảnh.
// Hook chỉ bắn ở đầu và cuối mỗi tool nên một lệnh chạy lâu có thể im lặng hợp lệ, vì vậy ngưỡng stale chỉ cảnh báo chứ không đổi trạng thái.
const STALE_MS = (Number(process.env.STALE_MIN) || 15) * 60e3;
const ABANDON_MS = Math.max(STALE_MS, (Number(process.env.ABANDON_MIN) || 60) * 60e3);
const sessions = new Map();
const clients = new Set();

const isAgentTool = (n) => ['task', 'agent'].includes(String(n || '').toLowerCase());
const recent = []; // 50 sự kiện gần nhất, xem tại /debug để dò lỗi adapter
const short = (s, n = 60) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Chuẩn hoá tên sự kiện/tool của Gemini CLI về cách gọi của Claude Code (Codex dùng sẵn tên giống Claude)
const EVENT_ALIASES = { BeforeAgent: 'UserPromptSubmit', BeforeTool: 'PreToolUse', AfterTool: 'PostToolUse', AfterAgent: 'Stop' };
const TOOL_ALIASES = { run_shell_command: 'Bash', read_file: 'Read', write_file: 'Write', replace: 'Edit', search_file_content: 'Grep',
  grep_search: 'Grep', list_directory: 'LS', google_web_search: 'WebSearch', web_fetch: 'WebFetch', write_todos: 'TodoWrite' };

function describeTool(e) {
  // Tên tool khác nhau giữa các công cụ (Claude: "Bash", omp: "bash"), nên so sánh không phân biệt hoa thường
  const t = e.tool_name || '', k = t.toLowerCase(), i = e.tool_input || {};
  const file = i.file_path || i.path || i.notebook_path || '';
  if (k === 'bash' || k === 'shell') return '$ ' + short(i.command, 40);
  if (['read', 'edit', 'write', 'multiedit', 'notebookedit'].includes(k)) return t + ' ' + path.basename(file);
  if (['grep', 'glob', 'find'].includes(k)) return t + ' ' + short(i.pattern || i.query, 30);
  if (k === 'ls') return 'ls ' + short(i.path || '.', 30);
  if (k === 'webfetch' || k === 'fetch') return 'Đọc web ' + short(i.url, 30);
  if (k === 'websearch' || k === 'web_search') return 'Tìm: ' + short(i.query, 30);
  if (k === 'todowrite' || k === 'todo') return 'Lên danh sách việc';
  return t || '…';
}

function getSession(map, e, now) {
  let s = map.get(e.session_id);
  if (!s) {
    s = { id: e.session_id, project: '?', status: 'idle', task: '', prompt: '', activity: '', agents: [], tools: [], updated: now };
    map.set(e.session_id, s);
  }
  if (e.cwd) s.project = path.basename(e.cwd);
  s.source = e.source || s.source || 'claude';
  if (e.model) s.model = e.model;
  s.updated = now;
  return s;
}

// Nhận diện tool lỗi: Claude Code gửi tool_response (is_error / error / exit code), adapter omp gửi is_error
function isToolError(e) {
  const r = e.tool_response;
  if (e.is_error === true) return true;
  if (!r || typeof r !== 'object') return false;
  const code = r.exit_code ?? r.exitCode ?? r.returncode;
  return r.is_error === true || r.success === false || !!r.error || (typeof code === 'number' && code !== 0);
}

// Chỉ giữ phần cần thiết của sự kiện (bỏ tool_response và các input lớn) trước khi ghi log
const KEEP_INPUT = ['description', 'subagent_type', 'file_path', 'path', 'notebook_path', 'command', 'pattern', 'query', 'url', 'prompt', 'task', 'agent', 'background'];
function slim(e) {
  const out = { session_id: e.session_id, hook_event_name: e.hook_event_name };
  const src = String(e.agent_source || '');
  if (/^[a-z0-9-]{1,20}$/.test(src)) out.source = src; // `source` trong payload của Claude Code là startup/resume, không phải tên công cụ
  for (const k of ['cwd', 'model', 'tool_name', 'tool_use_id']) if (e[k]) out[k] = String(e[k]).slice(0, 500);
  if (e.prompt) out.prompt = String(e.prompt).slice(0, 2000);
  if (e.message) out.message = String(e.message).slice(0, 300);
  if (isToolError(e)) out.is_error = true;
  if (e.usage && typeof e.usage === 'object') {
    out.usage = {};
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost']) if (Number.isFinite(e.usage[k])) out.usage[k] = e.usage[k];
  }
  if (e.tool_input && typeof e.tool_input === 'object') {
    out.tool_input = {};
    for (const k of KEEP_INPUT) if (e.tool_input[k] != null) out.tool_input[k] = String(e.tool_input[k]).slice(0, 400);
  }
  return out;
}

function pushTool(s, t) { s.tools.push(t); if (s.tools.length > 20) s.tools.shift(); }

// Sub-agent theo id; sự kiện của phiên con có thể đến trước khi phiên cha báo (việc chưa đặt tên) nên tạo mới nếu chưa có
function subAgent(s, e, now) {
  let a = s.agents.find((a) => a.id === e.tool_use_id);
  if (!a) {
    a = { id: e.tool_use_id, desc: short(String(e.tool_use_id).split(':').pop(), 50), prompt: '', type: 'task', bg: true, status: 'working', started: now };
    s.agents.push(a);
  }
  if (a.status !== 'working') { a.status = 'working'; a.ended = undefined; } // được nhắn việc tiếp sau khi đã xong
  return a;
}

// Hàm thuần: áp một sự kiện vào một Map session tại thời điểm `now` (dùng cho cả chạy thật lẫn replay)
function reduce(map, e, now) {
  if (e.hook_event_name === 'Usage') { const u = map.get(e.session_id); if (u) u.usage = e.usage; return; } // không tạo session mới, không đổi trạng thái
  const s = getSession(map, e, now);
  const ti = e.tool_input || {};
  switch (e.hook_event_name) {
    case 'SessionStart':
      s.status = 'idle'; break;
    case 'UserPromptSubmit':
      s.status = 'working'; s.task = short(e.prompt, 80); s.prompt = String(e.prompt || ''); s.tools = [];
      s.activity = 'Đọc yêu cầu'; s.started = now; s.error = null; break;
    case 'PreToolUse':
      s.status = 'working';
      if (isAgentTool(e.tool_name)) {
        const info = {
          desc: short(ti.description || 'Sub-agent', 50),
          prompt: short(ti.prompt || ti.task || '', 400),
          type: ti.subagent_type || 'general-purpose',
          bg: !!ti.background, // chạy nền (omp): xong khi phiên con báo, không phải khi trưởng nhóm dừng
        };
        const old = e.tool_use_id && s.agents.find((a) => a.id === e.tool_use_id);
        if (old) Object.assign(old, info);
        else s.agents.push({ id: e.tool_use_id || Math.random().toString(36).slice(2), ...info, status: 'working', started: now });
        s.activity = 'Giao việc cho sub-agent';
      } else {
        s.activity = describeTool(e);
        pushTool(s, { id: e.tool_use_id, at: now, text: s.activity });
      }
      break;
    case 'PostToolUse':
      if (isAgentTool(e.tool_name)) {
        const a = s.agents.find((a) => a.status === 'working' &&
          (e.tool_use_id ? a.id === e.tool_use_id : a.desc === short(ti.description || 'Sub-agent', 50)));
        if (a) { a.status = 'done'; a.ended = now; a.activity = ''; }
      } else if (isToolError(e)) {
        const text = describeTool(e);
        s.error = { text, at: now };
        const t = e.tool_use_id && [...s.tools].reverse().find((t) => t.id === e.tool_use_id);
        if (t) t.error = true; else pushTool(s, { id: e.tool_use_id, at: now, text, error: true });
      }
      break;
    case 'SubagentStart':
      if (e.tool_use_id) subAgent(s, e, now);
      break;
    case 'SubagentTool':
      if (e.tool_use_id) { const a = subAgent(s, e, now); a.activity = describeTool(e); a.toolCount = (a.toolCount || 0) + 1; }
      break;
    case 'Notification':
      s.status = 'waiting'; s.activity = short(e.message || 'Cần bạn xác nhận', 50); break;
    case 'Stop':
      s.status = 'idle'; s.activity = ''; s.error = null;
      s.agents.forEach((a) => { if (a.status === 'working' && !a.bg) { a.status = 'done'; a.ended = now; } });
      break;
    case 'SessionEnd':
      map.delete(e.session_id); break;
  }
}

let logSize = 0;
try { logSize = fs.statSync(LOG_FILE).size; } catch {}
function logEvent(ev, now) {
  const line = JSON.stringify({ ts: now, ...ev }) + '\n';
  try {
    if (logSize > LOG_MAX) { fs.renameSync(LOG_FILE, LOG_FILE + '.old'); logSize = 0; }
    fs.appendFileSync(LOG_FILE, line); logSize += Buffer.byteLength(line);
  } catch (err) { console.error('Không ghi được log:', err.message); }
}

let dirty = false;
function saveState() {
  if (!dirty || DEMO) return;
  dirty = false;
  try {
    fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify([...sessions.values()]));
    fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
  } catch (err) { console.error('Không lưu được trạng thái:', err.message); }
}
if (!DEMO) {
  try { for (const s of JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) sessions.set(s.id, s); } catch {}
  setInterval(saveState, 5e3).unref();
  const bye = () => { saveState(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}

// Cộng token từ transcript của Claude Code (JSONL; mỗi message.id có thể lặp lại nhiều dòng nên lấy bản cuối)
async function claudeUsage(file) {
  const root = path.join(os.homedir(), '.claude') + path.sep, p = path.resolve(String(file));
  if (!p.startsWith(root) || !p.endsWith('.jsonl')) return null;
  if ((await fs.promises.stat(p)).size > 100 * 1024 * 1024) return null;
  const byId = new Map();
  for (const line of (await fs.promises.readFile(p, 'utf8')).split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const o = JSON.parse(line), u = o.message && o.message.usage;
      if (o.type === 'assistant' && u) byId.set(o.message.id || o.uuid, u);
    } catch {}
  }
  if (!byId.size) return null;
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const u of byId.values()) {
    t.input += u.input_tokens || 0; t.output += u.output_tokens || 0;
    t.cacheRead += u.cache_read_input_tokens || 0; t.cacheWrite += u.cache_creation_input_tokens || 0;
  }
  return t;
}

function apply(e, source) {
  if (!e || !e.session_id) return;
  e = { ...e, hook_event_name: EVENT_ALIASES[e.hook_event_name] || e.hook_event_name, tool_name: TOOL_ALIASES[e.tool_name] || e.tool_name };
  if (source && !e.agent_source) e.agent_source = source;
  const now = Date.now();
  recent.push({ at: new Date(now).toISOString(), ...e }); if (recent.length > 50) recent.shift();
  const ev = slim(e);
  reduce(sessions, ev, now);
  if (!DEMO) logEvent(ev, now);
  dirty = true;
  broadcast();
  const s = sessions.get(e.session_id);
  if (e.hook_event_name === 'Stop' && e.transcript_path && s && s.source === 'claude' && !DEMO) {
    claudeUsage(e.transcript_path)
      .then((usage) => { if (usage) apply({ session_id: e.session_id, hook_event_name: 'Usage', usage }); })
      .catch((err) => console.error('Không đọc được transcript:', err.message));
  }
}

// Dọn việc cũ và phiên bị bỏ; trả về true nếu có thay đổi cần lưu
function sweep(map, now) {
  let changed = false;
  for (const [id, s] of map) {
    if (now - s.updated > ABANDON_MS) {
      if (s.status !== 'idle') { s.status = 'idle'; s.activity = ''; s.error = null; changed = true; }
      // gồm cả sub-agent chạy nền của nhóm đã rảnh: phiên con bị tắt ngang thì không còn ai báo xong
      s.agents.forEach((a) => { if (a.status === 'working') { a.status = 'done'; a.ended = s.updated; changed = true; } });
    }
    const kept = s.agents.filter((a) => a.status === 'working' || now - a.ended < 15 * 60e3); // giữ việc xong trong 15 phút
    if (kept.length !== s.agents.length) { s.agents = kept; changed = true; }
    if (s.status === 'idle' && now - s.updated > 2 * 3600e3) { map.delete(id); changed = true; } // dọn session ngủ quá 2 giờ
    else s.stale = s.status !== 'idle' && now - s.updated > STALE_MS;
  }
  return changed;
}
const serialize = (map, now) => JSON.stringify({ now, sessions: [...map.values()] });
function snapshotOf(map, now) { sweep(map, now); return serialize(map, now); }
function snapshot() {
  const now = Date.now();
  if (sweep(sessions, now)) dirty = true;
  return serialize(sessions, now);
}

// Dựng lại các khung hình từ events.jsonl trong `minutes` phút gần nhất
function buildReplay(minutes) {
  const since = Date.now() - minutes * 60e3, events = [];
  for (const f of [LOG_FILE + '.old', LOG_FILE]) {
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line) continue;
      try { const ev = JSON.parse(line); if (ev.ts >= since) events.push(ev); } catch {}
    }
  }
  const map = new Map(), frames = [];
  for (const ev of events.slice(-REPLAY_MAX_EVENTS)) { reduce(map, ev, ev.ts); frames.push(snapshotOf(map, ev.ts)); }
  return `[${frames.join(',')}]`;
}

function broadcast() {
  const data = `data: ${snapshot()}\n\n`;
  for (const res of clients) res.write(data);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/event') {
    if (TOKEN && req.headers['x-agent-office-token'] !== TOKEN) { res.writeHead(401).end('unauthorized'); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { apply(JSON.parse(body), url.searchParams.get('source')); } catch (err) { console.error('Sự kiện lỗi:', err.message); }
      res.end('ok');
    });
    return;
  }
  if (req.url === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(recent, null, 2));
  }
  if (req.url.startsWith('/replay')) {
    const m = Math.min(24 * 60, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('minutes')) || 60));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(buildReplay(m));
  }
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${snapshot()}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
}).listen(PORT, HOST, () => console.log(`Văn phòng Agent: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));

setInterval(broadcast, 30e3); // giữ kết nối và dọn dẹp định kỳ

// ---------- Chế độ demo ----------
if (DEMO) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const projects = ['articles', 'tools', 'migrate', 'live-backup'];
  const engines = [['claude', 'claude-sonnet-4-5'], ['omp', 'gpt-5'], ['omp', 'gemini-2.5-pro'], ['omp', 'claude-opus-4-1']];
  const tasks = ['Audit SEO on-page', 'Kiểm tra Core Web Vitals', 'Viết checklist go-live', 'So sánh dữ liệu production',
    'Kiểm chứng 43 bài viết', 'Rà soát WCAG 2.1 AA', 'Lập kế hoạch migrate', 'Sửa lỗi build'];
  const tools = [['Read', { file_path: 'src/app.tsx' }], ['Bash', { command: 'npm run build' }], ['Grep', { pattern: 'TODO' }],
    ['Edit', { file_path: 'README.md' }], ['WebFetch', { url: 'https://example.com' }], ['TodoWrite', {}]];
  projects.forEach((p, i) => {
    const sid = 'demo-' + i, cwd = '/Users/demo/' + p;
    const send = (ev) => apply({ session_id: sid, cwd, agent_source: engines[i][0], model: engines[i][1], ...ev });
    send({ hook_event_name: 'SessionStart' });
    const use = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const tick = () => {
      const s = sessions.get(sid), r = Math.random();
      const working = s ? s.agents.filter((a) => a.status === 'working') : [];
      if (s && s.status === 'idle' && r < 0.6) send({ hook_event_name: 'UserPromptSubmit', prompt: pick(tasks) });
      else if (s && s.status === 'idle') { /* nghỉ */ }
      else if (r < 0.25 && working.length < 3)
        send({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 't' + Math.random(), tool_input: { description: pick(tasks), subagent_type: 'general-purpose' } });
      else if (r < 0.34 && working.length) { const [t, inp] = pick(tools); send({ hook_event_name: 'SubagentTool', tool_use_id: pick(working).id, tool_name: t, tool_input: inp }); }
      else if (r < 0.42 && working.length)
        send({ hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: working[0].id, tool_input: { description: working[0].desc } });
      else if (r < 0.46) send({ hook_event_name: 'Notification', message: 'Đang chờ bạn cho phép chạy lệnh' });
      else if (r < 0.52) send({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { exit_code: 1 } });
      else if (r < 0.6 && !working.length) {
        send({ hook_event_name: 'Stop' });
        use.input += 3000 + Math.random() * 9000 | 0; use.output += 500 + Math.random() * 2500 | 0; use.cacheRead += Math.random() * 60000 | 0;
        use.cost += 0.02 + Math.random() * 0.15;
        send({ hook_event_name: 'Usage', usage: { ...use, ...(i === 0 ? { cost: undefined } : {}) } }); // phiên Claude Code thật không có chi phí
      }
      else { const [t, inp] = pick(tools); send({ hook_event_name: 'PreToolUse', tool_name: t, tool_input: inp }); }
      setTimeout(tick, 1500 + Math.random() * 2500);
    };
    setTimeout(tick, i * 700);
  });
  console.log('Đang chạy chế độ demo với dữ liệu giả.');
}
