#!/usr/bin/env node
// Văn phòng Agent – Script tự động cài đặt / kiểm tra / gỡ bỏ Hooks 1-click
// Hỗ trợ: Claude Code, Gemini CLI, Antigravity IDE, Codex CLI, omp
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PORT = process.env.PORT || 4317;
const TOKEN = process.env.AGENT_OFFICE_TOKEN || '';
const HOST = process.env.HOST || 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

// Cờ dòng lệnh
const args = process.argv.slice(2);
const IS_UNINSTALL = args.includes('--uninstall');
const IS_STATUS = args.includes('--status');
const hasSpecific = args.some(a => ['--claude', '--gemini', '--antigravity', '--codex'].includes(a));
const TARGET_CLAUDE = !hasSpecific || args.includes('--claude');
const TARGET_GEMINI = !hasSpecific || args.includes('--gemini');
const TARGET_ANTIGRAVITY = !hasSpecific || args.includes('--antigravity') || args.includes('--gemini');
const TARGET_CODEX = !hasSpecific || args.includes('--codex');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Văn phòng Agent - Script cài đặt Hook tự động (1-Click Setup)
============================================================
Cách dùng:
  node setup-hooks.js              # Tự phát hiện và cài đặt cho tất cả các CLI/IDE tìm thấy
  node setup-hooks.js --status     # Kiểm tra trạng thái cài đặt của các công cụ
  node setup-hooks.js --claude     # Cài riêng cho Claude Code (~/.claude/settings.json)
  node setup-hooks.js --gemini     # Cài cho Gemini CLI (~/.gemini/settings.json)
  node setup-hooks.js --antigravity# Cài cho Antigravity IDE (.agents/hooks.json & ~/.gemini/config/)
  node setup-hooks.js --codex      # Cài cho Codex CLI (~/.codex/hooks.json)
  node setup-hooks.js --uninstall  # Gỡ bỏ hook của Agent Office khỏi các cấu hình

Biến môi trường:
  PORT=5000 AGENT_OFFICE_TOKEN=secret node setup-hooks.js
`);
  process.exit(0);
}

// Header token nếu có
const tokenHeader = TOKEN ? ` -H "X-Agent-Office-Token: ${TOKEN}"` : '';
const tokenHeaderQuoted = TOKEN ? ` -H \\"X-Agent-Office-Token: ${TOKEN}\\"` : '';

// Tạo lệnh curl chuẩn
const makeCurl = (query = '', isGemini = false) => {
  const url = `${BASE_URL}/event${query ? '?' + query : ''}`;
  if (isGemini) {
    return `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${url}' >/dev/null 2>&1; echo '{}'`;
  }
  return `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${url}' >/dev/null 2>&1 || true`;
};

// Đọc JSON an toàn
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Sao lưu file trước khi ghi đè
function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const bak = `${file}.bak-agent-office-${Date.now()}`;
  try {
    fs.copyFileSync(file, bak);
    return bak;
  } catch {
    return null;
  }
}

// Ghi JSON an toàn (kèm tạo thư mục cha nếu chưa có)
function writeJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Kiểm tra xem command có phải là hook của Agent Office không
const isOfficeCmd = (cmd) => String(cmd || '').includes('/event') && (String(cmd).includes(':4317') || String(cmd).includes(`:${PORT}`) || String(cmd).includes('agent-office'));

// -------------------------------------------------------------
// 1. CLAUDE CODE: ~/.claude/settings.json
// -------------------------------------------------------------
const CLAUDE_FILE = path.join(HOME, '.claude', 'settings.json');
function setupClaude(mode = (IS_UNINSTALL ? 'uninstall' : IS_STATUS ? 'status' : 'install')) {
  const status = { id: 'claude', name: 'Claude Code', file: CLAUDE_FILE, installed: false };
  const data = readJson(CLAUDE_FILE) || {};
  data.hooks = data.hooks || {};
  const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
  
  // Kiểm tra đã có chưa
  let hasOffice = false;
  for (const ev of events) {
    const list = data.hooks[ev] || [];
    for (const item of list) {
      for (const h of item.hooks || []) {
        if (isOfficeCmd(h.command)) hasOffice = true;
      }
    }
  }
  status.installed = hasOffice;

  if (mode === 'status') return status;

  if (mode === 'uninstall') {
    if (!hasOffice) return { ...status, msg: 'Chưa cài đặt' };
    backupFile(CLAUDE_FILE);
    for (const ev of events) {
      if (!data.hooks[ev]) continue;
      data.hooks[ev] = data.hooks[ev].filter((item) => {
        item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
        return item.hooks.length > 0;
      });
      if (data.hooks[ev].length === 0) delete data.hooks[ev];
    }
    writeJson(CLAUDE_FILE, data);
    return { ...status, installed: false, msg: 'Đã gỡ bỏ thành công' };
  }

  // Cài đặt
  backupFile(CLAUDE_FILE);
  const cmd = makeCurl();
  for (const ev of events) {
    data.hooks[ev] = data.hooks[ev] || [];
    // Gỡ bản cũ nếu có rồi thêm bản mới
    data.hooks[ev] = data.hooks[ev].filter((item) => {
      item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
      return item.hooks.length > 0;
    });
    const entry = { hooks: [{ type: 'command', command: cmd }] };
    if (ev === 'PreToolUse' || ev === 'PostToolUse') entry.matcher = '*';
    data.hooks[ev].push(entry);
  }
  writeJson(CLAUDE_FILE, data);
  return { ...status, installed: true, msg: 'Đã cài đặt thành công' };
}

// -------------------------------------------------------------
// 2. GEMINI CLI: ~/.gemini/settings.json
// -------------------------------------------------------------
const GEMINI_CLI_FILE = path.join(HOME, '.gemini', 'settings.json');
function setupGeminiCLI(mode = (IS_UNINSTALL ? 'uninstall' : IS_STATUS ? 'status' : 'install')) {
  const status = { id: 'gemini', name: 'Gemini CLI', file: GEMINI_CLI_FILE, installed: false };
  const data = readJson(GEMINI_CLI_FILE) || {};
  data.hooks = data.hooks || {};
  const events = ['SessionStart', 'BeforeAgent', 'BeforeTool', 'AfterTool', 'AfterAgent', 'Notification', 'SessionEnd'];
  
  let hasOffice = false;
  for (const ev of events) {
    const list = data.hooks[ev] || [];
    for (const item of list) {
      for (const h of item.hooks || []) {
        if (isOfficeCmd(h.command)) hasOffice = true;
      }
    }
  }
  status.installed = hasOffice;

  if (mode === 'status') return status;

  if (mode === 'uninstall') {
    if (!hasOffice) return { ...status, msg: 'Chưa cài đặt' };
    backupFile(GEMINI_CLI_FILE);
    for (const ev of events) {
      if (!data.hooks[ev]) continue;
      data.hooks[ev] = data.hooks[ev].filter((item) => {
        item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
        return item.hooks.length > 0;
      });
      if (data.hooks[ev].length === 0) delete data.hooks[ev];
    }
    writeJson(GEMINI_CLI_FILE, data);
    return { ...status, installed: false, msg: 'Đã gỡ bỏ thành công' };
  }

  // Cài đặt
  backupFile(GEMINI_CLI_FILE);
  const cmd = makeCurl('source=gemini', true);
  for (const ev of events) {
    data.hooks[ev] = data.hooks[ev] || [];
    data.hooks[ev] = data.hooks[ev].filter((item) => {
      item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
      return item.hooks.length > 0;
    });
    const entry = { hooks: [{ type: 'command', command: cmd }] };
    if (ev === 'BeforeTool' || ev === 'AfterTool') entry.matcher = '*';
    data.hooks[ev].push(entry);
  }
  writeJson(GEMINI_CLI_FILE, data);
  return { ...status, installed: true, msg: 'Đã cài đặt thành công' };
}

// -------------------------------------------------------------
// 3. ANTIGRAVITY IDE: Workspace .agents/hooks.json & Global ~/.gemini/config/hooks.json
// -------------------------------------------------------------
const AGY_WORKSPACE_FILE = path.join(process.cwd(), '.agents', 'hooks.json');
const AGY_GLOBAL_FILE = path.join(HOME, '.gemini', 'config', 'hooks.json');

function setupAntigravity(targetFile, scopeName, mode = (IS_UNINSTALL ? 'uninstall' : IS_STATUS ? 'status' : 'install')) {
  const status = { id: scopeName.includes('toàn') || scopeName.includes('Toàn') ? 'antigravity-global' : 'antigravity-workspace', name: `Antigravity IDE (${scopeName})`, file: targetFile, installed: false };
  const data = readJson(targetFile) || {};
  const hasOffice = !!data['agent-office'];
  status.installed = hasOffice;

  if (mode === 'status') return status;

  if (mode === 'uninstall') {
    if (!hasOffice) return { ...status, msg: 'Chưa cài đặt' };
    backupFile(targetFile);
    delete data['agent-office'];
    if (Object.keys(data).length === 0 && targetFile === AGY_WORKSPACE_FILE) {
      try { fs.unlinkSync(targetFile); } catch {}
    } else {
      writeJson(targetFile, data);
    }
    return { ...status, installed: false, msg: 'Đã gỡ bỏ thành công' };
  }

  // Cài đặt
  backupFile(targetFile);
  const preCmd = `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${BASE_URL}/event?source=gemini&event=PreToolUse' >/dev/null 2>&1; echo '{\"decision\":\"allow\"}'`;
  const postCmd = `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${BASE_URL}/event?source=gemini&event=PostToolUse' >/dev/null 2>&1; echo '{}'`;
  const invCmd = `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${BASE_URL}/event?source=gemini&event=PreInvocation' >/dev/null 2>&1; echo '{}'`;
  const stopCmd = `curl -s --max-time 1 -X POST -H 'Content-Type: application/json'${tokenHeader} --data-binary @- '${BASE_URL}/event?source=gemini&event=Stop' >/dev/null 2>&1; echo '{}'`;

  data['agent-office'] = {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: preCmd }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: postCmd }] }],
    PreInvocation: [{ type: 'command', command: invCmd }],
    Stop: [{ type: 'command', command: stopCmd }]
  };
  writeJson(targetFile, data);
  return { ...status, installed: true, msg: 'Đã cài đặt thành công' };
}

// -------------------------------------------------------------
// 4. CODEX CLI: ~/.codex/hooks.json
// -------------------------------------------------------------
const CODEX_FILE = path.join(HOME, '.codex', 'hooks.json');
function setupCodex(mode = (IS_UNINSTALL ? 'uninstall' : IS_STATUS ? 'status' : 'install')) {
  const status = { id: 'codex', name: 'Codex CLI', file: CODEX_FILE, installed: false };
  const data = readJson(CODEX_FILE) || {};
  data.hooks = data.hooks || {};
  const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];

  let hasOffice = false;
  for (const ev of events) {
    const list = data.hooks[ev] || [];
    for (const item of list) {
      for (const h of item.hooks || []) {
        if (isOfficeCmd(h.command)) hasOffice = true;
      }
    }
  }
  status.installed = hasOffice;

  if (mode === 'status') return status;

  if (mode === 'uninstall') {
    if (!hasOffice) return { ...status, msg: 'Chưa cài đặt' };
    backupFile(CODEX_FILE);
    for (const ev of events) {
      if (!data.hooks[ev]) continue;
      data.hooks[ev] = data.hooks[ev].filter((item) => {
        item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
        return item.hooks.length > 0;
      });
      if (data.hooks[ev].length === 0) delete data.hooks[ev];
    }
    writeJson(CODEX_FILE, data);
    return { ...status, installed: false, msg: 'Đã gỡ bỏ thành công' };
  }

  // Cài đặt
  backupFile(CODEX_FILE);
  const cmd = makeCurl('source=codex');
  for (const ev of events) {
    data.hooks[ev] = data.hooks[ev] || [];
    data.hooks[ev] = data.hooks[ev].filter((item) => {
      item.hooks = (item.hooks || []).filter((h) => !isOfficeCmd(h.command));
      return item.hooks.length > 0;
    });
    const entry = { hooks: [{ type: 'command', command: cmd }] };
    if (ev === 'PreToolUse' || ev === 'PostToolUse') entry.matcher = '*';
    data.hooks[ev].push(entry);
  }
  writeJson(CODEX_FILE, data);
  return { ...status, installed: true, msg: 'Đã cài đặt thành công' };
}

// -------------------------------------------------------------
// CHẠY CÀI ĐẶT / KIỂM TRA
// -------------------------------------------------------------
function getStatusAll() {
  return [
    setupClaude('status'),
    setupAntigravity(AGY_WORKSPACE_FILE, 'Thư mục hiện tại', 'status'),
    setupAntigravity(AGY_GLOBAL_FILE, 'Toàn cục', 'status'),
    setupGeminiCLI('status'),
    setupCodex('status')
  ];
}

function installAll() {
  return [
    setupClaude('install'),
    setupAntigravity(AGY_WORKSPACE_FILE, 'Thư mục hiện tại', 'install'),
    setupAntigravity(AGY_GLOBAL_FILE, 'Toàn cục', 'install'),
    setupGeminiCLI('install'),
    setupCodex('install')
  ];
}

function uninstallAll() {
  return [
    setupClaude('uninstall'),
    setupAntigravity(AGY_WORKSPACE_FILE, 'Thư mục hiện tại', 'uninstall'),
    setupAntigravity(AGY_GLOBAL_FILE, 'Toàn cục', 'uninstall'),
    setupGeminiCLI('uninstall'),
    setupCodex('uninstall')
  ];
}

function run() {
  console.log(`\n============================================================`);
  console.log(`🏢 VĂN PHÒNG AGENT - QUẢN LÝ HOOKS 1-CLICK`);
  console.log(`📍 Cổng server: ${PORT} | Token: ${TOKEN ? 'Có đặt' : 'Không dùng'}`);
  console.log(`============================================================\n`);

  const results = [];

  if (TARGET_CLAUDE) results.push(setupClaude());
  if (TARGET_ANTIGRAVITY) {
    results.push(setupAntigravity(AGY_WORKSPACE_FILE, 'Thư mục hiện tại'));
    results.push(setupAntigravity(AGY_GLOBAL_FILE, 'Toàn cục'));
  }
  if (TARGET_GEMINI) results.push(setupGeminiCLI());
  if (TARGET_CODEX) results.push(setupCodex());

  console.log(`┌────────────────────────────────────┬──────────────┬───────────────────────────────┐`);
  console.log(`│ CÔNG CỤ                            │ TRẠNG THÁI   │ CHI TIẾT                      │`);
  console.log(`├────────────────────────────────────┼──────────────┼───────────────────────────────┤`);

  for (const r of results) {
    const name = r.name.padEnd(34);
    const st = (r.installed ? '✓ ĐÃ CÀI' : '○ CHƯA CÀI').padEnd(12);
    const msg = (r.msg || (r.installed ? 'Hoạt động tốt' : 'Chưa cấu hình')).padEnd(29);
    console.log(`│ ${name} │ ${st} │ ${msg} │`);
  }
  console.log(`└────────────────────────────────────┴──────────────┴───────────────────────────────┘\n`);

  if (!IS_STATUS && !IS_UNINSTALL) {
    console.log(`💡 Mẹo: Khởi động lại các session Claude Code, Gemini hoặc Antigravity để nhận hook mới.`);
    console.log(`👉 Chạy 'node server.js' để bắt đầu quan sát trên http://localhost:${PORT}\n`);
  }

  return results;
}

// Cho phép gọi dưới dạng module từ server.js
if (require.main === module) {
  run();
} else {
  module.exports = { setupClaude, setupGeminiCLI, setupAntigravity, setupCodex, getStatusAll, installAll, uninstallAll, run };
}

