// Văn phòng Agent – server nhận sự kiện từ Claude Code hooks và đẩy về trình duyệt (SSE)
// Chạy: node server.js        (thật)
//       node server.js --demo (dữ liệu giả để xem thử)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const hooks = require('./setup-hooks');

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

// Chuẩn hoá tên sự kiện/tool của Gemini CLI và Antigravity về cách gọi của Claude Code
// (PreInvocation/PostInvocation của Antigravity chạy trước/sau MỖI lần gọi model nên không phải đầu/cuối lượt: xử lý riêng trong fromAntigravity)
const EVENT_ALIASES = { BeforeAgent: 'UserPromptSubmit', BeforeTool: 'PreToolUse', AfterTool: 'PostToolUse', AfterAgent: 'Stop' };
const TOOL_ALIASES = {
  run_shell_command: 'Bash', run_command: 'Bash',
  read_file: 'Read', view_file: 'Read',
  write_file: 'Write', write_to_file: 'Write',
  replace: 'Edit', replace_file_content: 'Edit', multi_replace_file_content: 'Edit',
  search_file_content: 'Grep', grep_search: 'Grep', find_by_name: 'Glob',
  list_directory: 'LS', list_dir: 'LS',
  google_web_search: 'WebSearch', search_web: 'WebSearch',
  web_fetch: 'WebFetch', read_url_content: 'WebFetch',
  write_todos: 'TodoWrite', browser_subagent: 'Task'
};
// Tham số của tool Antigravity (viết hoa chữ đầu) -> tên mà describeTool/slim dùng
const AGY_ARGS = { CommandLine: 'command', AbsolutePath: 'file_path', TargetFile: 'file_path', DirectoryPath: 'path',
  SearchPath: 'path', SearchDirectory: 'path', Query: 'query', Pattern: 'pattern', Url: 'url' };

// Payload của Antigravity: camelCase, không tự ghi tên sự kiện (hook truyền qua ?event=), không có id tool (dùng stepIdx).
// Trả về danh sách sự kiện kiểu Claude Code (invoke_subagent giao nhiều sub-agent một lúc nên có thể thành nhiều sự kiện).
function fromAntigravity(p, event) {
  const base = { session_id: p.conversationId, cwd: (p.workspacePaths || [])[0], model: p.modelName, agent_source: 'antigravity' };
  const s = sessions.get(p.conversationId);
  if (event === 'SessionStart') return [{ ...base, hook_event_name: 'SessionStart' }];
  if (event === 'Stop') return [{ ...base, hook_event_name: 'Stop' }];
  if (event === 'PreInvocation') {
    if (s && s.status === 'working') return [{ ...base, hook_event_name: 'Thinking' }];
    readAgyPrompt(p.transcriptPath, p.conversationId);
    return [{ ...base, hook_event_name: 'UserPromptSubmit', prompt: '' }];
  }
  if (event !== 'PreToolUse' && event !== 'PostToolUse') return [];
  const call = p.toolCall;
  if (!call || !call.name) return []; // PostToolUse cũng bắn cho bước không phải tool (toolCall null)
  const id = 'step-' + p.stepIdx, args = call.args || {};
  const err = typeof p.error === 'string' && p.error ? { tool_response: { error: p.error } } : {};
  if (call.name === 'invoke_subagent' && Array.isArray(args.Subagents)) {
    return args.Subagents.map((a, i) => ({ ...base, ...err, hook_event_name: event, tool_name: 'Task', tool_use_id: `${id}:${i}`,
      tool_input: { description: a.Role || a.TypeName || 'Sub-agent', subagent_type: a.TypeName || 'subagent', prompt: a.Prompt || '' } }));
  }
  const input = {};
  for (const [k, v] of Object.entries(args)) input[AGY_ARGS[k] || k] = v;
  return [{ ...base, ...err, hook_event_name: event, tool_name: TOOL_ALIASES[call.name] || call.name, tool_use_id: id, tool_input: input }];
}

// Lấy yêu cầu mới nhất của bạn từ transcript.jsonl của Antigravity (dòng type=USER_INPUT, nội dung trong <USER_REQUEST>)
const AGY_DIR = path.join(os.homedir(), '.gemini');
async function readAgyPrompt(file, sessionId) {
  if (!file || DEMO) return;
  file = path.resolve(String(file).replace(/^~(?=\/)/, os.homedir()));
  if (!file.startsWith(AGY_DIR + path.sep) || !file.endsWith('.jsonl')) return;
  try {
    const lines = (await fs.promises.readFile(file, 'utf8')).trimEnd().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"USER_INPUT"')) continue;
      const c = String(JSON.parse(lines[i]).content || '');
      const m = c.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
      const prompt = (m ? m[1] : c).trim();
      if (prompt) apply({ session_id: sessionId, hook_event_name: 'Prompt', prompt });
      return;
    }
  } catch (err) { console.error('Không đọc được transcript Antigravity:', err.message); }
}

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
    s = { id: e.session_id, project: '?', status: 'idle', task: '', prompt: '', activity: '', agents: [], tools: [], updated: now, runaway: null };
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

function extractOutput(r) {
  if (!r) return '';
  if (typeof r === 'string') return short(r, 600);
  if (typeof r === 'object') {
    const out = r.stdout ?? r.output ?? r.content ?? r.error ?? (r.exit_code != null ? `Exit code: ${r.exit_code}` : '');
    if (typeof out === 'string') return short(out, 600);
    if (Array.isArray(out)) return short(out.map((x) => (typeof x === 'string' ? x : x.text || '')).join('\n'), 600);
  }
  return '';
}

function extractInput(i) {
  if (!i || typeof i !== 'object') return '';
  if (i.command) return String(i.command);
  const file = i.file_path || i.path || i.notebook_path;
  if (file) return file + (i.content ? '\n' + short(i.content, 300) : '');
  if (i.pattern || i.query) return String(i.pattern || i.query);
  if (i.url) return String(i.url);
  if (i.description) return String(i.description);
  try { return JSON.stringify(i).slice(0, 400); } catch { return ''; }
}

function checkRunaway(s) {
  if (!s.tools || s.tools.length < 3) return null;
  const last3 = s.tools.slice(-3);
  if (last3.every((t) => t.text && t.text === last3[0].text)) {
    let count = 0;
    for (let i = s.tools.length - 1; i >= 0; i--) {
      if (s.tools[i].text === last3[0].text) count++;
      else break;
    }
    return { type: 'loop', text: last3[0].text, count, msg: `Lặp lại tool "${last3[0].text}" ${count} lần liên tiếp` };
  }
  if (last3.every((t) => t.error)) {
    let count = 0;
    for (let i = s.tools.length - 1; i >= 0; i--) {
      if (s.tools[i].error) count++;
      else break;
    }
    return { type: 'errors', count, msg: `${count} tool liên tiếp bị lỗi (nguy cơ kẹt vòng lặp)` };
  }
  return null;
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
  if (e.tool_response) { const o = extractOutput(e.tool_response); if (o) out.tool_output = o; }
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

function pushTool(s, t) { s.tools.push(t); if (s.tools.length > 25) s.tools.shift(); }

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
      s.activity = 'Đọc yêu cầu'; s.started = now; s.error = null; s.runaway = null; break;
    case 'Thinking': // Antigravity: sắp gọi model lần nữa trong cùng lượt
      s.status = 'working'; s.activity = 'Đang nghĩ…'; break;
    case 'Prompt': // Antigravity: yêu cầu đọc từ transcript sau UserPromptSubmit
      s.task = short(e.prompt, 80); s.prompt = String(e.prompt || ''); break;
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
        pushTool(s, {
          id: e.tool_use_id,
          at: now,
          name: e.tool_name || '',
          text: s.activity,
          input: extractInput(ti),
          output: null,
          error: false,
        });
        s.runaway = checkRunaway(s);
      }
      break;
    case 'PostToolUse':
      if (isAgentTool(e.tool_name)) {
        const a = s.agents.find((a) => a.status === 'working' &&
          (e.tool_use_id ? a.id === e.tool_use_id : a.desc === short(ti.description || 'Sub-agent', 50)));
        if (a) { a.status = 'done'; a.ended = now; a.activity = ''; }
      } else {
        const isErr = isToolError(e);
        const out = extractOutput(e.tool_response) || e.tool_output || '';
        const t = e.tool_use_id && [...s.tools].reverse().find((t) => t.id === e.tool_use_id);
        if (t) {
          if (isErr) t.error = true;
          if (out) t.output = out;
        } else if (isErr) {
          pushTool(s, {
            id: e.tool_use_id,
            at: now,
            name: e.tool_name || '',
            text: describeTool(e),
            input: extractInput(ti),
            output: out,
            error: true,
          });
        }
        if (isErr) {
          s.error = { text: describeTool(e), at: now };
        }
        s.runaway = checkRunaway(s);
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
      s.status = 'idle'; s.activity = ''; s.error = null; s.runaway = null;
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

function apply(e, source, eventName) {
  if (!e) return;
  if (!e.session_id && e.conversationId) { // Antigravity (nhận theo hình dạng payload, kể cả hook cũ gửi ?source=gemini)
    recent.push({ at: new Date().toISOString(), event: eventName, raw: e }); if (recent.length > 50) recent.shift();
    for (const ev of fromAntigravity(e, eventName)) apply(ev);
    return;
  }
  if (!e.session_id) return;
  if (!e.hook_event_name && eventName) e.hook_event_name = eventName;
  e = { ...e, hook_event_name: EVENT_ALIASES[e.hook_event_name] || e.hook_event_name, tool_name: TOOL_ALIASES[e.tool_name] || e.tool_name };
  if (source && !e.agent_source) e.agent_source = source;
  const now = Date.now();
  recent.push({ at: new Date(now).toISOString(), ...e }); if (recent.length > 50) recent.shift();
  const ev = slim(e);
  reduce(sessions, ev, now);
  if (!DEMO) logEvent(ev, now);
  else { memLog.push({ ts: now, ...ev }); if (memLog.length > 20000) memLog.shift(); }
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

// Đọc các sự kiện đã ghi từ thời điểm `since` (demo không ghi file nên giữ trong bộ nhớ)
const memLog = [];
function readEvents(since, until = Infinity) {
  if (DEMO) return memLog.filter((ev) => ev.ts >= since && ev.ts < until);
  const events = [];
  for (const f of [LOG_FILE + '.old', LOG_FILE]) {
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line) continue;
      try { const ev = JSON.parse(line); if (ev.ts >= since && ev.ts < until) events.push(ev); } catch {}
    }
  }
  return events;
}

// Bảng xếp hạng trong một ngày (giờ máy chủ): chạy lại các sự kiện và ghi lại mọi sub-agent/nhóm đã xuất hiện
function buildLeaderboard(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  const d = m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const now = Date.now(), events = readEvents(from, to);
  const map = new Map(), agents = new Map(), teams = new Map();
  for (const ev of events) {
    reduce(map, ev, ev.ts);
    const s = map.get(ev.session_id);
    if (!s) continue; // SessionEnd đã xoá; số liệu đã ghi ở các sự kiện trước
    const t = teams.get(s.id) || { id: s.id, project: s.project, tools: 0, agents: 0, usage: null };
    t.project = s.project; t.model = s.model; t.source = s.source; if (s.usage) t.usage = s.usage;
    if (ev.hook_event_name === 'PreToolUse' && !isAgentTool(ev.tool_name)) t.tools++;
    teams.set(s.id, t);
    for (const a of s.agents) agents.set(s.id + '|' + a.id, { ...a, project: s.project, team: s.id });
  }
  for (const t of teams.values()) t.agents = [...agents.values()].filter((a) => a.team === t.id).length;
  const end = Math.min(now, to);
  const subs = [...agents.values()].map((a) => ({ desc: a.desc, type: a.type, project: a.project, team: a.team, id: a.id,
    working: a.status === 'working', ms: (a.ended || end) - a.started, tools: a.toolCount || 0 }));
  const tok = (t) => (t.usage ? (t.usage.input || 0) + (t.usage.output || 0) : 0);
  const top = (arr, key) => arr.filter((x) => key(x) > 0).sort((a, b) => key(b) - key(a)).slice(0, 5);
  return JSON.stringify({
    day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, events: events.length,
    subagents: subs.length,
    longest: top(subs, (a) => a.ms),
    busiest: top(subs, (a) => a.tools),
    tokens: top([...teams.values()], tok).map((t) => ({ ...t, tokens: tok(t) })),
    teams: top([...teams.values()], (t) => t.tools + t.agents),
  });
}

// Dựng lại các khung hình từ events.jsonl trong `minutes` phút gần nhất
function buildReplay(minutes) {
  const events = readEvents(Date.now() - minutes * 60e3);
  const map = new Map(), frames = [];
  for (const ev of events.slice(-REPLAY_MAX_EVENTS)) { reduce(map, ev, ev.ts); frames.push(snapshotOf(map, ev.ts)); }
  return `[${frames.join(',')}]`;
}

function broadcast() {
  const data = `data: ${snapshot()}\n\n`;
  for (const res of clients) res.write(data);
}

// Quản lý hook ghi vào cấu hình của Claude Code/Gemini/Codex/Antigravity trong thư mục home, nên chỉ cho phép:
// - từ chính máy này (kể cả khi HOST=0.0.0.0), - Host là localhost (chặn DNS rebinding),
// - POST có Origin trùng với chính server (chặn trang web lạ gửi form/fetch no-cors), - không chạy ở chế độ demo.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function hookApi(req, res, url) {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const host = String(req.headers.host || '');
  const local = LOOPBACK.has(req.socket.remoteAddress) && /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host);
  if (!local) return send(403, { error: 'Chỉ quản lý hook được từ chính máy chạy server (http://localhost)' });
  if (DEMO) return send(403, { error: 'Chế độ demo không sửa cấu hình hook' });
  if (url.pathname === '/hooks-status') return send(200, hooks.status());
  if (req.method !== 'POST') return send(405, { error: 'Cần POST' });
  if (req.headers.origin !== `http://${host}`) return send(403, { error: 'Origin không hợp lệ' });
  const ids = url.searchParams.get('only') ? url.searchParams.get('only').split(',') : undefined;
  send(200, url.pathname === '/hooks-install' ? hooks.install(ids) : hooks.uninstall(ids));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/event') {
    if (TOKEN && req.headers['x-agent-office-token'] !== TOKEN) { res.writeHead(401).end('unauthorized'); return; }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { apply(JSON.parse(body), url.searchParams.get('source'), url.searchParams.get('event')); } catch (err) { console.error('Sự kiện lỗi:', err.message); }
      res.end('ok');
    });
    return;
  }
  if (req.url === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(recent, null, 2));
  }
  if (['/hooks-status', '/hooks-install', '/hooks-uninstall'].includes(url.pathname)) return hookApi(req, res, url);
  if (url.pathname === '/leaderboard') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(buildLeaderboard(url.searchParams.get('day')));
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
        send({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 't' + Math.random(), tool_input: { description: pick(tasks), subagent_type: pick(['scout', 'reviewer', 'sonic', 'general-purpose']) } });
      else if (r < 0.34 && working.length) { const [t, inp] = pick(tools); send({ hook_event_name: 'SubagentTool', tool_use_id: pick(working).id, tool_name: t, tool_input: inp }); }
      else if (r < 0.42 && working.length)
        send({ hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: working[0].id, tool_input: { description: working[0].desc } });
      else if (r < 0.46) send({ hook_event_name: 'Notification', message: 'Đang chờ bạn cho phép chạy lệnh' });
      else if (r < 0.50) send({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { exit_code: 1, error: 'Test failed: 1 assertion error in spec.js' } });
      else if (r < 0.55 && s && s.tools && s.tools.length) {
        const lastT = s.tools[s.tools.length - 1];
        send({ hook_event_name: 'PostToolUse', tool_use_id: lastT.id, tool_name: lastT.name || 'Bash', tool_input: { command: lastT.text }, tool_response: { exit_code: 0, stdout: 'Thao tác hoàn tất thành công (200 OK)' } });
      }
      else if (r < 0.62 && !working.length) {
        send({ hook_event_name: 'Stop' });
        use.input += 3000 + Math.random() * 9000 | 0; use.output += 500 + Math.random() * 2500 | 0; use.cacheRead += Math.random() * 60000 | 0;
        use.cost += 0.02 + Math.random() * 0.15;
        send({ hook_event_name: 'Usage', usage: { ...use, ...(i === 0 ? { cost: undefined } : {}) } }); // phiên Claude Code thật không có chi phí
      }
      else {
        // Dự án thứ 3 thỉnh thoảng lặp tool để biểu diễn cảnh báo vòng lặp vô tận (Runaway loop alarm)
        const isRunawayTest = i === 2 && s && s.tools && s.tools.length >= 2 && Math.random() < 0.35;
        const [t, inp] = isRunawayTest ? ['Bash', { command: 'npm run build --verify' }] : pick(tools);
        const tid = 'toolu_' + Math.random().toString(36).slice(2);
        send({ hook_event_name: 'PreToolUse', tool_use_id: tid, tool_name: t, tool_input: inp });
      }
      setTimeout(tick, 1500 + Math.random() * 2500);
    };
    setTimeout(tick, i * 700);
  });
  console.log('Đang chạy chế độ demo với dữ liệu giả.');
}
