// Kiểm tra các hàm thuần của server: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { reduce, slim, fromAntigravity, sweep, annotateConflicts, CONFLICT_MS, REMOVE_MS } = require('../server');

const T0 = 1_800_000_000_000;
const AGY = { conversationId: 'c1', workspacePaths: ['/w/shop'], modelName: 'gemini-3.6-flash' };
// Áp sự kiện Antigravity như apply() làm: chuyển đổi theo trạng thái hiện tại, slim (như khi ghi log) rồi reduce
function agy(map, event, payload, now) {
  const s = map.get('c1');
  for (const ev of fromAntigravity({ ...AGY, ...payload }, event, s && s.status)) reduce(map, slim(ev), now);
}

test('Antigravity: PreInvocation chỉ bắt đầu lượt mới khi nhóm đang rảnh, không xoá tool giữa các lần gọi model', () => {
  const map = new Map();
  agy(map, 'SessionStart', {}, T0);
  agy(map, 'PreInvocation', { invocationNum: 0 }, T0 + 1);
  const s = map.get('c1');
  assert.equal(s.status, 'working');
  assert.equal(s.started, T0 + 1);
  assert.equal(s.project, 'shop');
  assert.equal(s.source, 'antigravity');
  agy(map, 'PreToolUse', { stepIdx: 3, toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } }, T0 + 2);
  agy(map, 'PreInvocation', { invocationNum: 1 }, T0 + 3);
  assert.equal(s.started, T0 + 1, 'đồng hồ không chạy lại');
  assert.deepEqual(s.tools.map((t) => t.text), ['$ npm test']);
  assert.equal(s.activity, 'Đang nghĩ…');
  agy(map, 'Stop', { fullyIdle: true }, T0 + 4);
  agy(map, 'PreInvocation', { invocationNum: 0 }, T0 + 5);
  assert.equal(s.started, T0 + 5, 'lượt mới sau Stop');
  assert.deepEqual(s.tools, []);
});

test('Antigravity: PostToolUse có error đánh dấu đúng tool theo stepIdx', () => {
  const map = new Map();
  agy(map, 'PreInvocation', {}, T0);
  agy(map, 'PreToolUse', { stepIdx: 1, toolCall: { name: 'view_file', args: { AbsolutePath: '/w/shop/a.ts' } } }, T0 + 1);
  agy(map, 'PreToolUse', { stepIdx: 2, toolCall: { name: 'run_command', args: { CommandLine: 'npm run build' } } }, T0 + 2);
  agy(map, 'PostToolUse', { stepIdx: 1, error: '', toolCall: { name: 'view_file', args: {} } }, T0 + 3);
  agy(map, 'PostToolUse', { stepIdx: 2, error: 'exit status 1', toolCall: { name: 'run_command', args: {} } }, T0 + 4);
  const s = map.get('c1');
  assert.deepEqual(s.tools.map((t) => [t.text, t.error]), [['Read a.ts', false], ['$ npm run build', true]]);
  assert.equal(s.error.text, '$ npm run build');
});

test('Antigravity: bước không phải tool (toolCall null) bị bỏ qua', () => {
  assert.deepEqual(fromAntigravity({ ...AGY, stepIdx: 4, toolCall: null }, 'PostToolUse', 'working'), []);
  assert.deepEqual(fromAntigravity({ ...AGY }, 'PostInvocation', 'working'), []);
});

test('Antigravity: invoke_subagent giao nhiều sub-agent, PostToolUse đưa tất cả ra góc cà phê', () => {
  const map = new Map();
  agy(map, 'PreInvocation', {}, T0);
  const sub = { Subagents: [{ Role: 'Soát lỗi', TypeName: 'reviewer', Prompt: 'review' }, { TypeName: 'general', Prompt: 'test' }] };
  agy(map, 'PreToolUse', { stepIdx: 6, toolCall: { name: 'invoke_subagent', args: sub } }, T0 + 1);
  const s = map.get('c1');
  assert.deepEqual(s.agents.map((a) => [a.id, a.desc, a.type, a.status]),
    [['step-6:0', 'Soát lỗi', 'reviewer', 'working'], ['step-6:1', 'general', 'general', 'working']]);
  agy(map, 'PostToolUse', { stepIdx: 6, toolCall: { name: 'invoke_subagent', args: sub } }, T0 + 2);
  assert.deepEqual(s.agents.map((a) => a.status), ['done', 'done']);
});

test('Stop kết thúc sub-agent thường nhưng không kết thúc sub-agent chạy nền', () => {
  const map = new Map();
  const e = (ev) => reduce(map, { session_id: 's', ...ev }, T0);
  e({ hook_event_name: 'UserPromptSubmit', prompt: 'x' });
  e({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 'fg', tool_input: { description: 'thường' } });
  e({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_use_id: 'bg', tool_input: { description: 'nền', background: '1' } });
  e({ hook_event_name: 'Stop' });
  assert.deepEqual(map.get('s').agents.map((a) => [a.id, a.status]), [['fg', 'done'], ['bg', 'working']]);
});

test('Trùng file: hai nhóm sửa cùng file (kể cả đường dẫn tương đối) thì cả hai bị đánh dấu', () => {
  const map = new Map();
  reduce(map, { session_id: 'a', cwd: '/w/shop', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/w/shop/src/login.ts' } }, T0);
  reduce(map, { session_id: 'b', cwd: '/w/shop', hook_event_name: 'PreToolUse', tool_name: 'edit', tool_input: { path: 'src/login.ts' } }, T0 + 1000);
  reduce(map, { session_id: 'b', cwd: '/w/shop', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/w/shop/README.md' } }, T0 + 1000);
  annotateConflicts(map, T0 + 2000);
  for (const [id, other] of [['a', 'b'], ['b', 'a']]) {
    const c = map.get(id).conflicts;
    assert.equal(c.length, 1, id);
    assert.equal(c[0].file, '/w/shop/src/login.ts');
    assert.deepEqual(c[0].others.map((o) => o.id), [other]);
  }
});

test('Trùng file: sub-agent của cùng một nhóm không tính; sửa cách nhau quá CONFLICT_MIN thì hết cảnh báo', () => {
  const map = new Map();
  const edit = (sid, ev, now) => reduce(map, { session_id: sid, cwd: '/w', tool_input: { file_path: '/w/x.js' }, tool_name: 'Write', ...ev }, now);
  edit('a', { hook_event_name: 'PreToolUse' }, T0);
  edit('a', { hook_event_name: 'SubagentTool', tool_use_id: 'a:Sub' }, T0 + 1);
  annotateConflicts(map, T0 + 2);
  assert.deepEqual(map.get('a').conflicts, []);
  edit('b', { hook_event_name: 'PreToolUse' }, T0 + CONFLICT_MS + 1);
  annotateConflicts(map, T0 + CONFLICT_MS + 2);
  assert.deepEqual(map.get('b').conflicts, []);
});

test('sweep: nhóm im lặng chuyển về rảnh rồi rời văn phòng sau REMOVE_MIN', () => {
  const map = new Map();
  reduce(map, { session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'x' }, T0);
  sweep(map, T0 + REMOVE_MS - 1);
  assert.equal(map.get('s').status, 'idle', 'quá ABANDON_MIN thì về rảnh');
  sweep(map, T0 + REMOVE_MS + 1);
  assert.equal(map.has('s'), false);
});
