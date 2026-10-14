// Extension cho omp (oh-my-pi): gửi hoạt động của agent về Văn phòng Agent.
// Dịch sự kiện của omp sang cùng định dạng với hook của Claude Code, nên server không cần biết model là gì.
//
// Đã đối chiếu với omp 18.7.0: các sự kiện session_start, before_agent_start, tool_call,
// tool_result, agent_end, session_shutdown đều có trong omp. Chưa chạy thử trọn vẹn một phiên thật.
// Nạp bằng: omp -e /đường/dẫn/omp-office.ts
// Mọi chỗ đều bọc try/catch nên nếu sai cũng không làm hỏng omp,
// chỉ là văn phòng không thấy gì. Khi đó mở http://localhost:4317/debug để xem server nhận được gì.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";

const URL = process.env.AGENT_OFFICE_URL || "http://localhost:4317/event";
const TOKEN = process.env.AGENT_OFFICE_TOKEN || "";

// Cộng token và chi phí từ file phiên của omp (mỗi dòng type=message, role=assistant có usage). Không tính sub-agent chạy ở file riêng.
async function sessionUsage(file) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let n = 0;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (!line.includes('"usage"')) continue;
    try {
      const m = JSON.parse(line).message, u = m && m.role === "assistant" && m.usage;
      if (!u) continue;
      n++; t.input += u.input || 0; t.output += u.output || 0; t.cacheRead += u.cacheRead || 0; t.cacheWrite += u.cacheWrite || 0;
      t.cost += (u.cost && u.cost.total) || 0;
    } catch {}
  }
  return n ? t : null;
}

export default function (pi) {
  let sessionId = "omp-" + process.pid + "-" + Date.now().toString(36);
  let cwd = process.cwd();
  let model = "";
  let sessionFile = "";
  let isSubagent = false; // phiên con: file nằm trong thư mục của phiên cha (<cha>/<Tên>.jsonl)
  let parentId = "", agentKey = ""; // phiên con: id phiên cha và id sub-agent mà phiên cha đã báo (`<id cha>:<Tên>`)
  const subTasks = new Map(); // toolCallId -> các việc đang chờ có tên (việc không đặt tên thì lấy tên từ kết quả của tool task)

  const post = (ev) => {
    try {
      fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(TOKEN ? { "X-Agent-Office-Token": TOKEN } : {}) },
        body: JSON.stringify({ cwd, agent_source: "omp", ...ev }),
        signal: AbortSignal.timeout(1000),
      }).catch(() => {});
    } catch {}
  };
  const send = (ev) => {
    if (isSubagent) return; // phiên con báo qua sendParent, không tạo thêm trưởng nhóm
    post({ session_id: sessionId, model, ...ev });
  };
  // Phiên con báo về đúng bàn của mình trong nhóm cha (không gửi model để khỏi đè model của trưởng nhóm)
  const sendParent = (ev) => { if (isSubagent && parentId) post({ session_id: parentId, tool_use_id: agentKey, ...ev }); };

  // Lấy thông tin phiên/model từ ctx nếu có (tên thuộc tính có thể khác giữa các phiên bản)
  const readCtx = (ctx) => {
    try {
      if (ctx?.cwd) cwd = ctx.cwd;
      const sm = ctx?.sessionManager;
      const f = sm?.getSessionFile?.();
      if (typeof f === "string") {
        sessionFile = f;
        isSubagent = existsSync(dirname(f) + ".jsonl");
        if (isSubagent) {
          // Thư mục phiên cha có dạng <thời điểm>_<id phiên>, file phiên con là <Tên>.jsonl
          parentId = "omp-" + basename(dirname(f)).split("_").pop();
          agentKey = parentId + ":" + basename(f).replace(/\.jsonl$/, "");
        }
      }
      const id = sm?.getSessionId?.() || f;
      if (id) sessionId = "omp-" + String(id).split(/[\\/]/).pop().replace(/\.jsonl$/, "");
      const m = ctx?.model;
      if (m) model = typeof m === "string" ? m : m.id || m.name || model;
    } catch {}
  };

  const on = (name, fn) => {
    try {
      pi.on(name, async (event, ctx) => {
        try { readCtx(ctx); fn(event || {}); } catch {}
        // không trả về gì: omp tiếp tục bình thường, không chặn tool
      });
    } catch {}
  };

  const toolName = (e) => e.toolName ?? e.name ?? e.tool?.name ?? "";
  const toolId = (e) => e.toolCallId ?? e.id ?? e.callId;
  const toolInput = (e) => e.input ?? e.args ?? e.arguments ?? e.params ?? {};
  const isTask = (n) => ["task", "agent", "subagent"].includes(String(n).toLowerCase());

  // Mô tả từng sub-agent: hỗ trợ cả 1 việc và danh sách nhiều việc song song
  const describeTasks = (input) => {
    const list = Array.isArray(input.tasks) ? input.tasks : [input];
    return list.map((t) => ({
      name: t.name ? String(t.name) : "",
      description: String(t.name || t.description || t.agent || "Sub-agent").slice(0, 120),
      prompt: String(t.prompt || t.task || t.assignment || "").slice(0, 400),
      subagent_type: t.agent || t.subagent_type || "task",
    }));
  };
  const resultText = (e) => {
    const c = e.content ?? e.result?.content ?? e.result ?? e.output ?? "";
    if (typeof c === "string") return c;
    return Array.isArray(c) ? c.map((p) => (typeof p === "string" ? p : p?.text || "")).join("\n") : "";
  };
  const startTask = (t, key) =>
    send({ hook_event_name: "PreToolUse", tool_name: "Task", tool_use_id: key, tool_input: { ...t, background: "1" } });

  on("session_start", () => send({ hook_event_name: "SessionStart" }));

  on("before_agent_start", (e) => {
    sendParent({ hook_event_name: "SubagentStart" });
    send({ hook_event_name: "UserPromptSubmit", prompt: e.prompt ?? e.text ?? "" });
  });

  on("tool_call", (e) => {
    const name = toolName(e), id = toolId(e), input = toolInput(e);
    if (isSubagent) return sendParent({ hook_event_name: "SubagentTool", tool_name: name, tool_input: input });
    if (isTask(name)) {
      // Việc có tên báo ngay; việc không tên chờ omp đặt tên (in trong kết quả tool task) để khớp với file phiên con
      const list = describeTasks(input);
      for (const t of list) if (t.name) startTask(t, `${sessionId}:${t.name}`);
      subTasks.set(id, list);
    } else {
      send({ hook_event_name: "PreToolUse", tool_name: name, tool_use_id: id, tool_input: input });
    }
  });

  on("tool_result", (e) => {
    if (isSubagent) return;
    const name = toolName(e), id = toolId(e);
    if (isTask(name)) {
      const list = subTasks.get(id) || [];
      subTasks.delete(id);
      const text = resultText(e);
      // Kết quả có dạng "- `Tên` (job `Tên`)"; omp đặt tên theo đúng thứ tự các việc
      const names = [...text.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
      list.forEach((t, i) => {
        const key = `${sessionId}:${t.name || names[i] || id + ":" + i}`;
        if (!t.name) startTask({ ...t, description: names[i] || t.description }, key);
        // Chạy đồng bộ (kết quả đã có <task-result>) hoặc giao việc thất bại thì xong luôn; còn lại chờ phiên con báo agent_end
        if (/<task-result/.test(text) || e.isError === true) send({ hook_event_name: "PostToolUse", tool_name: "Task", tool_use_id: key, tool_input: {} });
      });
    } else {
      send({ hook_event_name: "PostToolUse", tool_name: name, tool_use_id: id, tool_input: toolInput(e), is_error: e.isError === true || e.is_error === true });
    }
  });

  on("agent_end", () => {
    sendParent({ hook_event_name: "PostToolUse", tool_name: "Task", tool_input: {} });
    send({ hook_event_name: "Stop" });
    if (sessionFile) sessionUsage(sessionFile).then((usage) => usage && send({ hook_event_name: "Usage", usage })).catch(() => {});
  });

  on("session_shutdown", () => send({ hook_event_name: "SessionEnd" }));
}
