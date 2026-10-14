#!/usr/bin/env node
// Văn phòng Agent – cài / kiểm tra / gỡ hook cho Claude Code, Gemini CLI, Codex CLI và Antigravity.
// Dùng từ dòng lệnh (node setup-hooks.js --help) hoặc từ server.js (require: không đọc argv, không tự chạy).
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const MARK = '# agent-office'; // đánh dấu lệnh do script này cài, để gỡ đúng hook của mình

// URL và token được ghép vào lệnh shell nên chỉ chấp nhận ký tự an toàn (không có nháy, $, `, ;, khoảng trắng…)
function config() {
  const url = process.env.AGENT_OFFICE_URL || `http://localhost:${process.env.PORT || 4317}/event`;
  const token = process.env.AGENT_OFFICE_TOKEN || '';
  if (!/^https?:\/\/[A-Za-z0-9.\-[\]:]+\/[A-Za-z0-9._~/-]*$/.test(url)) throw new Error(`AGENT_OFFICE_URL không hợp lệ: ${url}`);
  if (token && !/^[A-Za-z0-9._~+=-]+$/.test(token)) throw new Error('AGENT_OFFICE_TOKEN chỉ được gồm chữ, số và . _ ~ + = -');
  return { url, token };
}

// tokenFrom: 'env' = lệnh tự đọc $AGENT_OFFICE_TOKEN lúc chạy (không lưu bí mật vào file cấu hình);
//            'literal' = ghi thẳng token (Antigravity lọc biến môi trường nên hook không thấy biến này)
function curl(query, tokenFrom, tail) {
  const { url, token } = config();
  const header = !token ? '' : tokenFrom === 'env' ? ' -H "X-Agent-Office-Token: $AGENT_OFFICE_TOKEN"' : ` -H 'X-Agent-Office-Token: ${token}'`;
  return `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${header} --data-binary @- '${url}${query ? '?' + query : ''}' >/dev/null 2>&1 ${tail} ${MARK}`;
}

// Hook cũ cài tay theo hook-settings*.json không có dấu MARK: nhận theo URL /event của server
const isOffice = (cmd) => typeof cmd === 'string' && (cmd.includes(MARK) || /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/event\b/.test(cmd));

// File không tồn tại = cấu hình rỗng. File hỏng hoặc có comment thì dừng: ghi đè sẽ làm mất cấu hình của bạn.
function readConfig(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  let data;
  try { data = JSON.parse(text); } catch (err) { throw new Error(`không phải JSON chuẩn (${err.message}), có thể do comment. Không sửa để tránh mất cấu hình`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('nội dung không phải object JSON. Không sửa');
  return data;
}

// Giữ bản gốc trước lần sửa đầu tiên (không tạo thêm bản sao mỗi lần bấm), ghi qua file tạm để không bao giờ để lại file dở
function writeConfig(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bak = file + '.bak-agent-office';
  if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak);
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

// ---------- Kiểu Claude Code: { hooks: { Sự kiện: [ { matcher?, hooks: [ {type, command} ] } ] } } ----------
function hasClaudeStyle(data) {
  return Object.values(data.hooks || {}).some((groups) => Array.isArray(groups) &&
    groups.some((g) => (g.hooks || []).some((h) => isOffice(h.command))));
}
function stripClaudeStyle(data) {
  if (!data.hooks || typeof data.hooks !== 'object') return;
  for (const [ev, groups] of Object.entries(data.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOffice(h.command)) })).filter((g) => g.hooks.length);
    if (kept.length) data.hooks[ev] = kept; else delete data.hooks[ev];
  }
  if (!Object.keys(data.hooks).length) delete data.hooks;
}
function claudeStyle(events, matcherEvents, command) {
  return {
    has: hasClaudeStyle,
    strip: stripClaudeStyle,
    add(data) {
      data.hooks = data.hooks || {};
      const cmd = command();
      for (const ev of events) {
        const group = { hooks: [{ type: 'command', command: cmd }] };
        if (matcherEvents.includes(ev)) group.matcher = '*';
        (data.hooks[ev] = data.hooks[ev] || []).push(group);
      }
    },
  };
}

// ---------- Antigravity: { "<tên hook>": { Sự kiện: [...] } }, payload không ghi tên sự kiện nên truyền qua ?event= ----------
// Antigravity chặn tool nếu hook lỗi hoặc không in JSON, nên mọi lệnh đều kết thúc bằng echo (exit 0) dù server tắt.
const AGY_KEY = 'agent-office';
const antigravity = {
  has: (data) => !!data[AGY_KEY],
  strip: (data) => { delete data[AGY_KEY]; },
  add(data) {
    const cmd = (ev, out) => ({ type: 'command', command: curl(`source=antigravity&event=${ev}`, 'literal', `; echo '${out}'`), timeout: 5 });
    data[AGY_KEY] = {
      SessionStart: [cmd('SessionStart', '{}')],
      PreInvocation: [cmd('PreInvocation', '{}')],
      PreToolUse: [{ matcher: '*', hooks: [cmd('PreToolUse', '{"decision":"allow"}')] }],
      PostToolUse: [{ matcher: '*', hooks: [cmd('PostToolUse', '{}')] }],
      Stop: [cmd('Stop', '{}')],
    };
  },
};

const TOOLS = {
  claude: { name: 'Claude Code', file: path.join(HOME, '.claude', 'settings.json'),
    ...claudeStyle(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'],
      ['PreToolUse', 'PostToolUse'], () => curl('', 'env', '|| true')) },
  gemini: { name: 'Gemini CLI', file: path.join(HOME, '.gemini', 'settings.json'), // Gemini yêu cầu stdout chỉ có JSON
    ...claudeStyle(['SessionStart', 'BeforeAgent', 'BeforeTool', 'AfterTool', 'AfterAgent', 'Notification', 'SessionEnd'],
      ['BeforeTool', 'AfterTool'], () => curl('source=gemini', 'env', "; echo '{}'")) },
  codex: { name: 'Codex CLI', file: path.join(HOME, '.codex', 'hooks.json'),
    ...claudeStyle(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'],
      ['PreToolUse', 'PostToolUse'], () => curl('source=codex', 'env', '|| true')) },
  // Một file toàn cục dùng chung cho Antigravity IDE, CLI và app (không cài theo thư mục để khỏi gửi trùng sự kiện)
  antigravity: { name: 'Antigravity (IDE/CLI/app)', file: path.join(HOME, '.gemini', 'config', 'hooks.json'), ...antigravity },
};
const IDS = Object.keys(TOOLS);

function run(mode, ids = IDS) {
  return ids.filter((id) => TOOLS[id]).map((id) => {
    const t = TOOLS[id], base = { id, name: t.name, file: t.file };
    try {
      const data = readConfig(t.file);
      const had = t.has(data);
      if (mode === 'status') return { ...base, installed: had };
      if (mode === 'uninstall') {
        if (!had) return { ...base, installed: false, msg: 'Chưa cài' };
        t.strip(data); writeConfig(t.file, data);
        return { ...base, installed: false, msg: 'Đã gỡ' };
      }
      t.strip(data); t.add(data); writeConfig(t.file, data);
      return { ...base, installed: true, msg: had ? 'Đã cập nhật' : 'Đã cài' };
    } catch (err) {
      return { ...base, installed: null, error: err.message };
    }
  });
}
const status = (ids) => run('status', ids);
const install = (ids) => run('install', ids);
const uninstall = (ids) => run('uninstall', ids);

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Cài hook để các công cụ gửi hoạt động về Văn phòng Agent.

  node setup-hooks.js [--all | --claude --gemini --codex --antigravity]   cài (mặc định: tất cả)
  node setup-hooks.js --status                                            xem đã cài chưa
  node setup-hooks.js --uninstall [công cụ…]                              gỡ

Biến môi trường: AGENT_OFFICE_URL (mặc định http://localhost:4317/event), PORT, AGENT_OFFICE_TOKEN`);
    process.exit(0);
  }
  const ids = IDS.filter((id) => args.includes('--' + id));
  const mode = args.includes('--status') ? 'status' : args.includes('--uninstall') ? 'uninstall' : 'install';
  const rows = run(mode, ids.length ? ids : IDS);
  for (const r of rows) {
    const st = r.error ? '✗ LỖI' : r.installed ? '✓ đã cài' : '○ chưa cài';
    console.log(`${st.padEnd(11)} ${r.name.padEnd(26)} ${r.file}${r.error ? '\n            ' + r.error : r.msg ? '  (' + r.msg + ')' : ''}`);
  }
  if (mode === 'install') console.log('\nKhởi động lại phiên Claude Code / Gemini / Codex, và mở hội thoại mới trong Antigravity để nhận hook.');
  process.exit(rows.some((r) => r.error) ? 1 : 0);
}

module.exports = { status, install, uninstall, IDS };
