// Kiểm tra trình cài hook trên một HOME tạm (file này chạy trong process riêng nên đổi HOME không ảnh hưởng test khác)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-test-'));
process.env.HOME = HOME;
delete process.env.AGENT_OFFICE_TOKEN; delete process.env.AGENT_OFFICE_URL;
const hooks = require('../setup-hooks');
const file = (...p) => path.join(HOME, ...p);
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test('file có comment (không phải JSON chuẩn) không bị sửa, công cụ khác vẫn cài', () => {
  const f = file('.gemini', 'settings.json'), text = '{\n  // comment\n  "theme": "dark"\n}\n';
  write(f, text);
  const [gemini, codex] = hooks.install(['gemini', 'codex']);
  assert.match(gemini.error, /không phải JSON chuẩn/);
  assert.equal(fs.readFileSync(f, 'utf8'), text);
  assert.equal(codex.installed, true);
  fs.rmSync(f);
});

test('giữ hook khác, thay hook cũ cài tay, cài lại không tạo bản trùng, gỡ sạch', () => {
  const f = file('.claude', 'settings.json');
  const mine = { type: 'command', command: 'say done' };
  const legacy = { type: 'command', command: 'curl -s -X POST --data-binary @- http://localhost:4317/event || true' };
  write(f, JSON.stringify({ model: 'opus', hooks: { Stop: [{ hooks: [mine] }], PreToolUse: [{ matcher: '*', hooks: [legacy] }] } }));
  hooks.install(['claude']); hooks.install(['claude']);
  const after = json(f);
  assert.equal(after.model, 'opus');
  assert.deepEqual(after.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command.split(' ')[0])), ['say', 'curl']);
  assert.equal(after.hooks.PreToolUse.length, 1, 'hook cũ đã được thay, không bị lặp');
  assert.match(after.hooks.PreToolUse[0].hooks[0].command, /# agent-office$/);
  assert.equal(fs.existsSync(f + '.bak-agent-office'), true);
  hooks.uninstall(['claude']);
  assert.deepEqual(json(f), { model: 'opus', hooks: { Stop: [{ hooks: [mine] }] } });
});

test('token có ký tự shell bị từ chối và không ghi gì', () => {
  process.env.AGENT_OFFICE_TOKEN = 'a"; touch pwned; echo "';
  try {
    const [r] = hooks.install(['codex']);
    assert.match(r.error, /AGENT_OFFICE_TOKEN/);
  } finally { delete process.env.AGENT_OFFICE_TOKEN; }
});

test('hook Antigravity luôn in JSON hợp lệ và thoát 0 dù server không chạy', () => {
  process.env.AGENT_OFFICE_URL = 'http://127.0.0.1:9/event'; // cổng không có ai nghe
  try { hooks.install(['antigravity']); } finally { delete process.env.AGENT_OFFICE_URL; }
  const cfg = json(file('.gemini', 'config', 'hooks.json'))['agent-office'];
  const out = execFileSync('sh', ['-c', cfg.PreToolUse[0].hooks[0].command], { input: '{}' }).toString();
  assert.deepEqual(JSON.parse(out), { decision: 'allow' });
  const t = hooks.testCommand('antigravity');
  assert.equal(t.command, cfg.SessionStart[0].command);
  assert.equal(t.payload('x').conversationId, 'x');
});

test('Gửi thử từ chối hook không do script cài', () => {
  write(file('.codex', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'curl http://localhost:4317/event' }] }] } }));
  assert.throws(() => hooks.testCommand('codex'), /Chưa cài bằng script này/);
});
