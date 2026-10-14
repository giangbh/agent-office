// ---------- Đa ngôn ngữ (i18n) ----------
export let curLang = 'vi';
try {
  curLang = localStorage.getItem('agentOfficeLang') || (navigator.language && navigator.language.startsWith('en') ? 'en' : 'vi');
} catch(e) {}

export const I18N = {
  vi: {
    appTitle: 'Văn phòng Agent',
    connecting: 'Đang kết nối…',
    connected: 'Đã kết nối',
    connLost: 'Mất kết nối tới server, đang thử lại…',
    btnSoundOn: '🔊 Tắt âm thanh',
    btnSoundOff: '🔈 Bật âm thanh',
    btnNotifyOn: '🔔 Tắt thông báo',
    btnNotifyOff: '🔕 Bật thông báo',
    notifyUnsupported: 'Trình duyệt không hỗ trợ',
    btnReplay: '⏪ Xem lại',
    btnBoard: '🏆 Xếp hạng',
    btnTerm: '🖥️ Terminal',
    btnHooks: '⚡ Hooks',
    btnLang: '🌐 English',
    plaqueWork: '🖥 Khu làm việc',
    plaqueBoss: '📋 Phòng sếp',
    plaqueRest: '🛋 Phòng chờ việc',
    plaqueNap: '💤 Phòng ngủ gật & Server',
    plaqueCafe: '☕ Pantry & Cà phê',
    loungeDesc: 'Sub-agent làm xong ra đây ăn nhẹ & xả hơi',
    loungeEmpty: 'Chưa ai xong việc.',
    statSessions: 'nhóm (session)',
    statRunning: 'nhóm đang chạy',
    statSubsWorking: 'sub đang làm',
    statSubsDone: 'sub xong',
    statTokens: 'token (vào+ra)',
    statCost: 'chi phí',
    subStatus: (r, w) => `${r} nhóm đang chạy, ${w} sub-agent đang làm`,
    tabTitleWait: (n) => `(${n}) Chờ duyệt · Văn phòng Agent`,
    tabTitleNormal: 'Văn phòng Agent',
    leadRole: 'Trưởng nhóm',
    runawayBadge: '🚨 VÒNG LẶP',
    noSignal: (t) => `💤 Không có tín hiệu ${t}`,
    errorPrefix: '⚠ Lỗi: ',
    waitingPrefix: '⏳ ',
    thinking: 'Đang nghĩ…',
    idleWaiting: 'Đang chờ việc mới',
    vacant: {
      work: 'Chưa ai làm việc',
      boss: 'Không ai chờ duyệt 🎉',
      rest: 'Không có nhóm rảnh',
      nap: 'Không ai ngủ gật'
    },
    emptyWork: 'Chưa có nhóm nào trong văn phòng.<br>Mở Claude Code ở một thư mục bất kỳ, hoặc chạy <code>node server.js --demo</code> để xem thử.',
    bossYou: 'Bạn',
    bossPending: (n) => `${n} nhóm đang chờ bạn duyệt`,
    bossNoPending: 'Không có việc cần duyệt',
    agoSec: (s) => `${s} giây`,
    agoMinSec: (m, s) => `${m} phút ${s} giây`,
    agoBefore: (t) => `${t} trước`,
    // Drawer
    drawerStatus: { working: 'đang chạy', waiting: 'chờ bạn duyệt', idle: 'rảnh' },
    drawerRunawayTitle: '🚨 CẢNH BÁO VÒNG LẶP VÔ TẬN',
    drawerRunawaySub: '⚠️ Agent có dấu hiệu gọi lại cùng tool hoặc gặp lỗi liên tục. Mở Terminal để kiểm tra hoặc can thiệp tránh tiêu tốn token.',
    drawerConflicts: '⚠ Đang sửa trùng file',
    drawerThisTeam: 'Nhóm này',
    drawerRecentError: 'Lỗi gần nhất',
    drawerTokensCost: 'Token và chi phí',
    drawerInput: 'Vào',
    drawerOutput: 'Ra',
    drawerCacheRead: 'Cache đọc',
    drawerCacheWrite: 'Cache ghi',
    drawerCost: 'Chi phí',
    drawerNoCost: 'Công cụ này không báo chi phí',
    drawerPrompt: 'Yêu cầu',
    drawerRecentTools: (n) => `Tool gần đây (${n})`,
    drawerOpenTerm: '🖥️ Mở Terminal',
    drawerInspect: '>_ Soi',
    drawerInspectTitle: 'Bấm để soi lệnh trong Terminal',
    drawerSubAgents: (n) => `Sub-agent (${n})`,
    drawerNone: 'Chưa có',
    drawerRemoveBtn: '🗑 Xoá nhóm khỏi văn phòng',
    drawerRemoveTitle: 'Dùng khi phiên đã tắt nhưng nhóm vẫn còn. Nếu phiên còn chạy, nhóm sẽ quay lại ở sự kiện kế tiếp',
    drawerRemoveConfirm: (proj) => `Xoá nhóm "${proj}" khỏi văn phòng?`,
    serverUnreachable: 'Không gọi được server',
    // Leaderboard
    boardTitle: '🏆 Xếp hạng trong ngày',
    boardSubsEvents: (s, e) => `${s} sub-agent · ${e} sự kiện`,
    boardLongest: 'Chạy lâu nhất',
    boardBusiest: 'Gọi nhiều tool nhất',
    boardTokens: 'Nhóm tốn nhiều token nhất',
    boardTeams: 'Nhóm chăm chỉ nhất',
    boardNoData: 'Chưa có số liệu',
    boardLoadErr: 'Không tải được bảng xếp hạng.',
    boardFootnote: 'Số token là của cả nhóm (omp/Claude Code không tách token cho từng sub-agent). Sub-agent đã xong vẫn được tính dù đã rời góc cà phê.',
    runningNow: 'đang chạy',
    toolsCount: (n) => `${n} tool`,
    agentsCount: (n) => `${n} sub-agent`,
    // Hooks
    hookTitle: '⚡ Quản lý hook',
    hookIntro: 'Cài hook để Claude Code, Gemini CLI, Codex và Antigravity gửi hoạt động về văn phòng. File cấu hình được sao lưu thành <code>.bak-agent-office</code> trước lần sửa đầu tiên; file có comment hoặc không phải JSON chuẩn sẽ không bị sửa.',
    hookInstallAll: '⚡ Cài tất cả',
    hookUninstallAll: '🗑️ Gỡ tất cả',
    hookBadgeInstalled: '✓ ĐÃ CÀI',
    hookBadgeNotInstalled: '○ CHƯA CÀI',
    hookBadgeError: 'LỖI',
    hookTestBtn: 'Gửi thử',
    hookTestTitle: 'Chạy lệnh hook đã cài với payload mẫu và kiểm tra server có nhận được không',
    hookInstallBtn: 'Cài',
    hookUninstallBtn: 'Gỡ',
    hookUninstallConfirm: (only) => only ? 'Gỡ hook của Agent Office khỏi công cụ này?' : 'Gỡ hook của Agent Office khỏi tất cả công cụ?',
    hookSeen: (t) => t ? 'Nhận sự kiện lần cuối ' + t + ' trước' : 'Chưa nhận sự kiện nào (7 ngày qua)',
    hookTestOk: (ms) => `✓ Gửi thử: server nhận sau ${ms} ms`,
    hookTestFail: (err) => `✗ Gửi thử: ${err}`,
    hookAfterInstall: 'Sau khi cài: khởi động lại phiên Claude Code / Gemini / Codex, mở hội thoại mới trong Antigravity.',
    hookCliTitle: 'Dòng lệnh',
    // Terminal
    termEmpty: '> Chưa có session nào hoạt động trong văn phòng.',
    termBannerProject: 'DỰ ÁN',
    termBannerModel: 'MODEL',
    termBannerStatus: 'TRẠNG THÁI',
    termBannerCwd: 'CWD',
    termRunawayAlert: '[!] CẢNH BÁO VÒNG LẶP VÔ TẬN (RUNAWAY LOOP)',
    termType: 'LOẠI',
    termDetectedAt: 'PHÁT HIỆN LÚC',
    termExitError: 'EXIT 1 (LỖI)',
    termExitOk: 'EXIT 0 (OK)',
    termExitRunning: 'RUNNING / ĐANG CHẠY',
    termCopyCmd: 'Chép lệnh',
    termNoCmds: '> Chưa có lệnh nào được gọi trong phiên này.',
    termLightReady: 'Sẵn sàng',
    termLightRunaway: 'Bảo vệ vòng lặp: HOẠT ĐỘNG',
    termLightSSE: 'Luồng sự kiện SSE: ĐÃ KẾT NỐI',
    termBtnColorGreen: '🟢 Xanh',
    termBtnColorAmber: '🟠 Hổ phách',
    termBtnCopy: '📋 Chép log',
    termBtnCopied: '✓ Đã chép!',
    // Replay
    replayMin15: '15 phút',
    replayMin60: '1 giờ',
    replayMin240: '4 giờ',
    replayMin1440: '24 giờ',
    replayPlay: '▶ Phát',
    replayPause: '⏸ Dừng',
    replayLive: 'Về trực tiếp',
    replayNoLogs: 'Chưa có log trong khoảng này',
    // Notifications
    notifyWaitingTitle: (proj) => `Chờ bạn duyệt: ${proj}`,
    notifyConflictTitle: (f) => `Hai nhóm cùng sửa ${f}`,
    notifyConflictBody: (p1, pOthers) => `${p1} và ${pOthers}`
  },
  en: {
    appTitle: 'Agent Office',
    connecting: 'Connecting…',
    connected: 'Connected',
    connLost: 'Disconnected from server, reconnecting…',
    btnSoundOn: '🔊 Mute Sound',
    btnSoundOff: '🔈 Enable Sound',
    btnNotifyOn: '🔔 Mute Notifications',
    btnNotifyOff: '🔕 Enable Notifications',
    notifyUnsupported: 'Browser not supported',
    btnReplay: '⏪ Replay',
    btnBoard: '🏆 Leaderboard',
    btnTerm: '🖥️ Terminal',
    btnHooks: '⚡ Hooks',
    btnLang: '🌐 Tiếng Việt',
    plaqueWork: '🖥 Work Area',
    plaqueBoss: '📋 Boss Office',
    plaqueRest: '🛋 Idle Lounge',
    plaqueNap: '💤 Nap & Server',
    plaqueCafe: '☕ Pantry & Cafe',
    loungeDesc: 'Sub-agents relax and grab snacks here after completing tasks',
    loungeEmpty: 'No one has finished yet.',
    statSessions: 'sessions',
    statRunning: 'active sessions',
    statSubsWorking: 'subs working',
    statSubsDone: 'subs finished',
    statTokens: 'tokens (in+out)',
    statCost: 'total cost',
    subStatus: (r, w) => `${r} active session${r===1?'':'s'}, ${w} sub-agent${w===1?'':'s'} working`,
    tabTitleWait: (n) => `(${n}) Awaiting Approval · Agent Office`,
    tabTitleNormal: 'Agent Office',
    leadRole: 'Team Lead',
    runawayBadge: '🚨 RUNAWAY',
    noSignal: (t) => `💤 No signal ${t}`,
    errorPrefix: '⚠ Error: ',
    waitingPrefix: '⏳ ',
    thinking: 'Thinking…',
    idleWaiting: 'Waiting for tasks',
    vacant: {
      work: 'No one is working',
      boss: 'No one awaiting approval 🎉',
      rest: 'No idle teams',
      nap: 'No one napping'
    },
    emptyWork: 'No teams in the office yet.<br>Launch Claude Code in any project directory, or run <code>node server.js --demo</code> to preview.',
    bossYou: 'You',
    bossPending: (n) => `${n} team${n===1?'':'s'} awaiting your approval`,
    bossNoPending: 'No pending approvals',
    agoSec: (s) => `${s}s`,
    agoMinSec: (m, s) => `${m}m ${s}s`,
    agoBefore: (t) => `${t} ago`,
    // Drawer
    drawerStatus: { working: 'running', waiting: 'awaiting approval', idle: 'idle' },
    drawerRunawayTitle: '🚨 RUNAWAY LOOP DETECTED',
    drawerRunawaySub: '⚠️ Agent is repeatedly invoking identical tools or encountering errors. Inspect terminal logs to avoid token depletion.',
    drawerConflicts: '⚠ Conflicting Files',
    drawerThisTeam: 'This team',
    drawerRecentError: 'Recent Errors',
    drawerTokensCost: 'Tokens & Cost',
    drawerInput: 'Input',
    drawerOutput: 'Output',
    drawerCacheRead: 'Cache Read',
    drawerCacheWrite: 'Cache Write',
    drawerCost: 'Cost',
    drawerNoCost: 'Cost tracking not supported for this provider',
    drawerPrompt: 'Prompt / Task',
    drawerRecentTools: (n) => `Recent Tools (${n})`,
    drawerOpenTerm: '🖥️ Open Terminal',
    drawerInspect: '>_ Inspect',
    drawerInspectTitle: 'Click to inspect command in Terminal',
    drawerSubAgents: (n) => `Sub-agents (${n})`,
    drawerNone: 'None',
    drawerRemoveBtn: '🗑 Remove team from office',
    drawerRemoveTitle: 'Use when session has exited but remains on screen. If still active, it will reappear on next event',
    drawerRemoveConfirm: (proj) => `Remove team "${proj}" from office?`,
    serverUnreachable: 'Failed to contact server',
    // Leaderboard
    boardTitle: '🏆 Daily Leaderboard',
    boardSubsEvents: (s, e) => `${s} sub-agent${s===1?'':'s'} · ${e} event${e===1?'':'s'}`,
    boardLongest: 'Longest Running',
    boardBusiest: 'Most Active (Tools)',
    boardTokens: 'Highest Token Usage',
    boardTeams: 'Most Hardworking Team',
    boardNoData: 'No data available',
    boardLoadErr: 'Failed to load leaderboard.',
    boardFootnote: 'Token count reflects the entire session (omp/Claude Code does not isolate tokens per sub-agent). Finished sub-agents remain counted after leaving cafe.',
    runningNow: 'running',
    toolsCount: (n) => `${n} tool${n===1?'':'s'}`,
    agentsCount: (n) => `${n} sub-agent${n===1?'':'s'}`,
    // Hooks
    hookTitle: '⚡ Hook Manager',
    hookIntro: 'Install hooks so Claude Code, Gemini CLI, Codex, and Antigravity stream activities to Agent Office. Config files are backed up to <code>.bak-agent-office</code> before any edits; non-standard JSON with comments is never modified.',
    hookInstallAll: '⚡ Install All',
    hookUninstallAll: '🗑️ Uninstall All',
    hookBadgeInstalled: '✓ INSTALLED',
    hookBadgeNotInstalled: '○ NOT INSTALLED',
    hookBadgeError: 'ERROR',
    hookTestBtn: 'Test',
    hookTestTitle: 'Execute installed hook command with a test payload and verify server receipt',
    hookInstallBtn: 'Install',
    hookUninstallBtn: 'Uninstall',
    hookUninstallConfirm: (only) => only ? 'Uninstall Agent Office hook from this tool?' : 'Uninstall Agent Office hooks from all tools?',
    hookSeen: (t) => t ? 'Last received event ' + t + ' ago' : 'No events received (last 7 days)',
    hookTestOk: (ms) => `✓ Test: server acknowledged in ${ms} ms`,
    hookTestFail: (err) => `✗ Test failed: ${err}`,
    hookAfterInstall: 'After installation: restart your Claude Code / Gemini / Codex session, or open a new conversation in Antigravity.',
    hookCliTitle: 'CLI Commands',
    // Terminal
    termEmpty: '> No active sessions in office.',
    termBannerProject: 'PROJECT',
    termBannerModel: 'MODEL',
    termBannerStatus: 'STATUS',
    termBannerCwd: 'CWD',
    termRunawayAlert: '[!] RUNAWAY LOOP DETECTED',
    termType: 'TYPE',
    termDetectedAt: 'DETECTED AT',
    termExitError: 'EXIT 1 (ERROR)',
    termExitOk: 'EXIT 0 (OK)',
    termExitRunning: 'RUNNING',
    termCopyCmd: 'Copy command',
    termNoCmds: '> No commands invoked in this session yet.',
    termLightReady: 'Ready',
    termLightRunaway: 'Loop Guard: ACTIVE',
    termLightSSE: 'SSE Stream: CONNECTED',
    termBtnColorGreen: '🟢 Green',
    termBtnColorAmber: '🟠 Amber',
    termBtnCopy: '📋 Copy Log',
    termBtnCopied: '✓ Copied!',
    // Replay
    replayMin15: '15 mins',
    replayMin60: '1 hour',
    replayMin240: '4 hours',
    replayMin1440: '24 hours',
    replayPlay: '▶ Play',
    replayPause: '⏸ Pause',
    replayLive: 'Live View',
    replayNoLogs: 'No logs found in this timeframe',
    // Notifications
    notifyWaitingTitle: (proj) => `Awaiting approval: ${proj}`,
    notifyConflictTitle: (f) => `File edit conflict on ${f}`,
    notifyConflictBody: (p1, pOthers) => `${p1} and ${pOthers}`
  }
};

export const t = () => I18N[curLang] || I18N.vi;
export const getLang = () => curLang;
export const setLang = (newLang) => {
  curLang = newLang;
  try { localStorage.setItem('agentOfficeLang', curLang); } catch(e) {}
};

export function applyStaticLang() {
  const dict = t();
  const titleEl = document.getElementById('mainTitle');
  if (titleEl && titleEl.childNodes.length > 0) titleEl.childNodes[0].textContent = dict.appTitle;
  const langB = document.getElementById('langBtn');
  if (langB) langB.textContent = dict.btnLang;
  const replayB = document.getElementById('replayBtn');
  if (replayB) replayB.textContent = dict.btnReplay;
  const boardB = document.getElementById('boardBtn');
  if (boardB) boardB.textContent = dict.btnBoard;
  const termB = document.getElementById('termBtn');
  if (termB) termB.textContent = dict.btnTerm;
  const hookB = document.getElementById('hookBtn');
  if (hookB) hookB.textContent = dict.btnHooks;

  const updateSec = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-label', txt);
  };
  updateSec('sec-work', dict.plaqueWork);
  updateSec('sec-boss', dict.plaqueBoss);
  updateSec('sec-rest', dict.plaqueRest);
  updateSec('sec-nap', dict.plaqueNap);
  updateSec('sec-cafe', dict.plaqueCafe);

  const updatePlaque = (id, txt, countId) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cnt = document.getElementById(countId);
    const countVal = cnt ? cnt.textContent : '0';
    el.innerHTML = `${txt}<b id="${countId}">${countVal}</b>`;
  };
  updatePlaque('plaque-work', dict.plaqueWork, 'n-work');
  updatePlaque('plaque-boss', dict.plaqueBoss, 'n-boss');
  updatePlaque('plaque-rest', dict.plaqueRest, 'n-rest');
  updatePlaque('plaque-nap', dict.plaqueNap, 'n-nap');
  updatePlaque('plaque-cafe', dict.plaqueCafe, 'n-cafe');

  const ld = document.getElementById('loungeDesc');
  if (ld) ld.textContent = dict.loungeDesc;
  const rt = document.getElementById('replayTitle');
  if (rt) rt.textContent = dict.btnReplay;
  const o15 = document.getElementById('opt-15'); if (o15) o15.textContent = dict.replayMin15;
  const o60 = document.getElementById('opt-60'); if (o60) o60.textContent = dict.replayMin60;
  const o240 = document.getElementById('opt-240'); if (o240) o240.textContent = dict.replayMin240;
  const o1440 = document.getElementById('opt-1440'); if (o1440) o1440.textContent = dict.replayMin1440;
  const rLive = document.getElementById('replayLive'); if (rLive) rLive.textContent = dict.replayLive;
}

export const getMascotTexts = (m, type) => {
  const list = m[type];
  if (!list) return [];
  if (Array.isArray(list)) return list;
  return list[curLang] || list.vi || list.en || [];
};
