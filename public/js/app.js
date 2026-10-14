// ---------- Văn phòng Agent - Main Application Module ----------
import { t, getLang, setLang, applyStaticLang } from './i18n.js';
import { beep, SOUND, toggleSound, paintBtn } from './audio.js';
import { color, provider, fmtTok, fmtCost, esc, usageChip, engineChip, person, paintFurn } from './sprites.js';
import { initMascot, tickMascot } from './mascot.js';

const $ = id => document.getElementById(id);
const baseName = f => String(f || '').split('/').pop();
const clock = tVal => new Date(tVal).toLocaleTimeString(getLang() === 'vi' ? 'vi-VN' : 'en-US');
const ago = ms => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? t().agoSec(s) : t().agoMinSec(Math.floor(s / 60), s % 60);
};

// ---------- Trạng thái ứng dụng ----------
let state = { now: Date.now(), sessions: [] };
let live = state;
let offset = 0;
let prev = null;
let selected = null;
let replay = null;

// ---------- Thông báo hệ thống ----------
const STUCK_MS = 10 * 60e3;
const ERR_MS = 20e3;
let notifyOn = false;
try {
  notifyOn = localStorage.getItem('agentOfficeNotify') === '1' && 'Notification' in window && Notification.permission === 'granted';
} catch(e) {}

const nbtn = $('notify');
function paintNotify() {
  if (!nbtn) return;
  nbtn.setAttribute('aria-pressed', notifyOn);
  nbtn.textContent = notifyOn ? t().btnNotifyOn : t().btnNotifyOff;
}
if (nbtn) {
  nbtn.onclick = async () => {
    if (!('Notification' in window)) { nbtn.textContent = t().notifyUnsupported; return; }
    if (notifyOn) {
      notifyOn = false;
    } else {
      const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      notifyOn = p === 'granted';
    }
    try { localStorage.setItem('agentOfficeNotify', notifyOn ? '1' : '0'); } catch(e) {}
    paintNotify();
  };
}

function notifyWaiting(s) {
  if (!notifyOn || !document.hidden) return;
  try {
    new Notification(t().notifyWaitingTitle(s.project), {
      body: s.activity || (getLang() === 'en' ? 'Needs confirmation' : 'Cần bạn xác nhận'),
      tag: 'agent-office-' + s.id
    });
  } catch(e) {}
}

function notifyConflict(s) {
  if (!notifyOn || !document.hidden) return;
  const c = s.conflicts[0];
  try {
    new Notification(t().notifyConflictTitle(baseName(c.file)), {
      body: t().notifyConflictBody(s.project, [...new Set(c.others.map(o => o.project))].join(', ')),
      tag: 'agent-office-conflict-' + c.file
    });
  } catch(e) {}
}

function detectChanges(S) {
  if (prev) S.forEach(s => { if (s.status === 'waiting' && prev['s' + s.id] !== 'waiting') notifyWaiting(s); });
  const cur = {};
  let alarm = false;
  S.forEach(s => {
    cur['s' + s.id] = s.status;
    cur['r' + s.id] = s.runaway ? s.runaway.count : 0;
    if (s.runaway && (!prev || !prev['r' + s.id])) alarm = true;
    const files = (s.conflicts || []).map(c => c.file).sort().join('|');
    cur['c' + s.id] = files;
    if (prev && files && (prev['c' + s.id] || '') !== files && (s.conflicts || []).some(c => !(prev['c' + s.id] || '').split('|').includes(c.file))) {
      alarm = true;
      notifyConflict(s);
    }
    s.agents.forEach(a => cur['a' + a.id] = a.status);
  });
  if (prev) {
    let done = false, waiting = false, hired = false;
    for (const k in cur) {
      if (k[0] === 'a' && cur[k] === 'done' && prev[k] === 'working') done = true;
      if (k[0] === 'a' && cur[k] === 'working' && !prev[k]) hired = true;
      if (k[0] === 's' && cur[k] === 'waiting' && prev[k] !== 'waiting') waiting = true;
    }
    if (alarm) beep(SOUND.alarm);
    else if (waiting) beep(SOUND.waiting);
    else if (done) beep(SOUND.done);
    else if (hired) beep(SOUND.hired);
  }
  prev = cur;
}

// ---------- Phòng & Animation ----------
const roomOf = s => s.stale ? 'nap' : s.status === 'waiting' ? 'boss' : s.status === 'working' ? 'work' : 'rest';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function capturePods() {
  const m = new Map();
  for (const el of document.querySelectorAll('#floor [data-sid]')) {
    m.set(el.dataset.sid, { r: el.getBoundingClientRect(), room: el.parentElement.id });
  }
  return m;
}

const walkUntil = new Map();
function walkPods(old) {
  if (reduceMotion.matches || document.hidden) return;
  const nowTime = performance.now();
  for (const el of document.querySelectorAll('#floor [data-sid]')) {
    const sid = el.dataset.sid, o = old.get(sid);
    if (!o) {
      el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' });
      continue;
    }
    const r = el.getBoundingClientRect(), dx = o.r.left - r.left, dy = o.r.top - r.top;
    if (Math.abs(dx) + Math.abs(dy) < 2) continue;
    if (o.room !== el.parentElement.id) walkUntil.set(sid, nowTime + 900);
    const left = (walkUntil.get(sid) || 0) - nowTime, walking = left > 50;
    if (walking) el.classList.add('walk'); else walkUntil.delete(sid);
    el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: walking ? left : 350, easing: 'cubic-bezier(.3,.7,.4,1)' })
      .onfinish = () => el.classList.remove('walk');
  }
}

// ---------- Vẽ chính (render) ----------
export function render() {
  const dict = t();
  const curLang = getLang();
  const now = replay ? state.now : Date.now() + offset, S = state.sessions;
  const agents = S.flatMap(s => s.agents.map(a => ({ ...a, team: color(s.id), project: s.project, stale: !!s.stale })));
  const working = agents.filter(a => a.status === 'working' && !a.stale), done = agents.filter(a => a.status === 'done');
  const running = S.filter(s => s.status !== 'idle' && !s.stale).length;
  const tokTotal = S.reduce((a, s) => a + ((s.usage && (s.usage.input || 0) + (s.usage.output || 0)) || 0), 0);
  const costTotal = S.reduce((a, s) => a + ((s.usage && s.usage.cost) || 0), 0);

  const statsEl = $('stats');
  if (statsEl) {
    statsEl.innerHTML = [
      ['#5AB0FF', S.length, dict.statSessions],
      ['#B98CFF', running, dict.statRunning],
      ['#FFC857', working.length, dict.statSubsWorking],
      ['#7BD389', done.length, dict.statSubsDone],
      ...(tokTotal ? [['#4FD1C5', fmtTok(tokTotal), dict.statTokens]] : []),
      ...(costTotal ? [['#FF9ECF', fmtCost(costTotal), dict.statCost]] : [])
    ].map(([c, n, l]) => `<div class="stat" style="--c:${c}"><b>${n}</b><span>${l}</span></div>`).join('');
  }

  const subEl = $('sub');
  if (subEl) subEl.textContent = dict.subStatus(running, working.length);

  const nWait = S.filter(s => s.status === 'waiting').length;
  document.title = nWait ? dict.tabTitleWait(nWait) : dict.tabTitleNormal;

  const pod = s => {
    const col = color(s.id), mine = s.agents.filter(a => a.status === 'working');
    const err = s.status === 'working' && s.error && now - s.error.at < ERR_MS;
    const isRunaway = !!s.runaway;
    const runawayChip = isRunaway ? `<span class="runaway-badge" title="${esc(s.runaway.msg)}">🚨 ${dict.runawayBadge} (${s.runaway.count})</span>` : '';
    const bubble = isRunaway
      ? `🚨 ${esc(s.runaway.msg)}`
      : s.stale
        ? dict.noSignal(ago(now - s.updated))
        : err
          ? dict.errorPrefix + esc(s.error.text)
          : s.status === 'waiting'
            ? dict.waitingPrefix + esc(s.activity)
            : s.status === 'working'
              ? esc(s.activity || dict.thinking)
              : dict.idleWaiting;
    const run = s.status !== 'idle' && s.started ? ` · <span class="timer">${ago(now - s.started)}</span>` : '';
    const cf = s.conflicts || [];
    const conflictHtml = cf.length ? (curLang === 'en'
      ? `<div class="conflict" title="${esc(cf.map(c => c.file).join('\n'))}">⚠ Conflict editing ${cf.slice(0, 2).map(c => `<b>${esc(baseName(c.file))}</b> with ${esc([...new Set(c.others.map(o => o.project))].join(', '))}`).join('; ')}${cf.length > 2 ? ` and ${cf.length - 2} other files` : ''}</div>`
      : `<div class="conflict" title="${esc(cf.map(c => c.file).join('\n'))}">⚠ Cùng sửa ${cf.slice(0, 2).map(c => `<b>${esc(baseName(c.file))}</b> với ${esc([...new Set(c.others.map(o => o.project))].join(', '))}`).join('; ')}${cf.length > 2 ? ` và ${cf.length - 2} file khác` : ''}</div>`) : '';

    return `<section class="pod ${s.status}${s.stale ? ' stale' : ''}${isRunaway ? ' runaway' : ''}${cf.length ? ' conflict' : ''}" data-sid="${esc(s.id)}" tabindex="0" role="button" style="--team:${col}">
      <header class="flag"><span class="flag-name">${esc(s.project)}</span>${engineChip(s)}${usageChip(s)}${runawayChip}<span class="flag-task" title="${esc(s.task)}">${esc(s.task)}</span></header>
      <div class="lead">${person(col, s.stale ? 'idle' : s.status + (isRunaway ? ' runaway' : err ? ' err' : ''), s.id, true)}<div><div class="role">${dict.leadRole}${run}</div><div class="bubble${isRunaway ? ' err' : err && !s.stale ? ' err' : ''}">${bubble}</div></div></div>
      ${conflictHtml}
      ${mine.length ? `<div class="desks">${mine.map(a => `<div class="desk working">${a.activity ? `<span class="act" title="${esc(a.activity)}">${esc(a.activity)}</span>` : ''}${person(col, 'working', a.id, false, a.type)}<div class="table"><span class="laptop"></span></div>
        <span class="tag" title="${esc(a.desc)}">${esc(a.desc)}</span><span class="timer${now - a.started > STUCK_MS ? ' stuck' : ''}">${now - a.started > STUCK_MS ? '⚠ ' : ''}${ago(now - a.started)}</span></div>`).join('')}</div>` : ''}
    </section>`;
  };

  const rooms = { work: [], boss: [], rest: [], nap: [] };
  S.forEach(s => rooms[roomOf(s)].push(s));
  const old = capturePods();
  for (const k in rooms) {
    const countEl = $('n-' + k);
    if (countEl) countEl.textContent = rooms[k].length;
    const roomEl = $('room-' + k);
    if (roomEl) {
      roomEl.innerHTML = rooms[k].map(pod).join('') || (k === 'work' && !S.length
        ? `<div class="empty">${dict.emptyWork}</div>`
        : `<div class="vacant">${dict.vacant[k]}</div>`);
    }
  }
  walkPods(old);

  // Phòng sếp
  const bossEl = $('bossdesk');
  if (bossEl) {
    bossEl.innerHTML = `${person('#FFC857', nWait ? 'waiting' : 'idle', 'boss-you', true)}<div><div class="table"><span class="laptop"></span></div></div>
      <div class="who">${dict.bossYou}<span>${nWait ? dict.bossPending(nWait) : dict.bossNoPending}</span></div>`;
  }

  const d = new Date(now);
  document.querySelectorAll('.clock').forEach(c => c.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const floorEl = $('floor');
  if (floorEl) floorEl.classList.toggle('night', d.getHours() < 6 || d.getHours() >= 18);

  const nCafe = $('n-cafe');
  if (nCafe) nCafe.textContent = done.length;
  const loungeEl = $('lounge');
  if (loungeEl) {
    loungeEl.innerHTML = done.sort((a, b) => b.ended - a.ended).slice(0, 10)
      .map(a => `<div class="done">${person(a.team, 'idle', a.id, false, a.type)}<div><div class="tag">${esc(a.desc)}</div><span class="check">✓ ${esc(a.project)}, ${dict.agoBefore(ago(now - a.ended))}</span></div></div>`).join('')
      || `<p>${dict.loungeEmpty}</p>`;
  }

  tickMascot(rooms.work.length > 0);
  renderDrawer(now);
  if (!$('termDrawer').hidden) renderTerminal();
}

// ---------- Drawer chi tiết ----------
const drawer = $('drawer');
function renderDrawer(now) {
  const dict = t();
  const s = selected && state.sessions.find(x => x.id === selected);
  if (!s) { drawer.hidden = true; return; }
  const col = color(s.id), tools = (s.tools || []).slice().reverse();
  const ST = dict.drawerStatus;
  const runawayBox = s.runaway ? `<div class="runaway-box">
    <b>${dict.drawerRunawayTitle}</b>
    <p>${esc(s.runaway.msg)}</p>
    <small>${dict.drawerRunawaySub}</small>
  </div>` : '';
  const h = `<button class="x" aria-label="Close" id="drawerX">×</button>
    <h2>${esc(s.project)}</h2>
    <div>${engineChip(s)} <span class="st">${ST[s.status] || s.status}${s.started && s.status !== 'idle' ? ' · ' + ago(now - s.started) : ''}</span></div>
    <div class="st" title="${esc(s.id)}">${esc(s.id)}</div>
    ${(s.conflicts || []).length ? `<h3>${dict.drawerConflicts}</h3><ul>${s.conflicts.map(c => `<li class="bad"><b>${esc(c.file)}</b><div class="st">${dict.drawerThisTeam} (${esc(c.who)}, ${clock(c.at)})${c.others.map(o => ` · ${esc(o.project)} (${esc(o.who)}, ${clock(o.at)})`).join('')}</div></li>`).join('')}</ul>` : ''}
    ${runawayBox}
    ${s.error ? `<h3>${dict.drawerRecentError}</h3><ul><li class="bad"><small>${clock(s.error.at)}</small>${esc(s.error.text)}</li></ul>` : ''}
    ${s.usage ? `<h3>${dict.drawerTokensCost}</h3><ul><li>${dict.drawerInput}: <b>${fmtTok(s.usage.input || 0)}</b> · ${dict.drawerOutput}: <b>${fmtTok(s.usage.output || 0)}</b></li>
      <li>${dict.drawerCacheRead}: ${fmtTok(s.usage.cacheRead || 0)} · ${dict.drawerCacheWrite}: ${fmtTok(s.usage.cacheWrite || 0)}</li>
      <li>${s.usage.cost != null ? dict.drawerCost + ': <b>' + fmtCost(s.usage.cost) + '</b>' : '<span class="st">' + dict.drawerNoCost + '</span>'}</li></ul>` : ''}
    <h3>${dict.drawerPrompt}</h3><div class="prompt">${esc(s.prompt || s.task || '(chưa có)')}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 6px">
      <h3 style="margin:0">${dict.drawerRecentTools(tools.length)}</h3>
      <button class="term-btn" id="openTermFromDrawer" title="Retro Terminal Inspector">${dict.drawerOpenTerm}</button>
    </div>
    <ul>${tools.map(item => `<li class="${item.error ? 'bad' : ''} tool-item" data-tool-id="${esc(item.id || '')}" title="${dict.drawerInspectTitle}"><small>${clock(item.at)}</small>${item.error ? '⚠ ' : ''}${esc(item.text)}<span class="inspect-tag">${dict.drawerInspect}</span></li>`).join('') || `<li>${dict.drawerNone}</li>`}</ul>
    <h3>${dict.drawerSubAgents(s.agents.length)}</h3>
    ${gantt(s.agents, now)}
    <ul>${s.agents.map(a => `<li><small>${a.status === 'working' ? '⏳' : '✓'}</small><b>${esc(a.desc)}</b> <span class="st">${esc(a.type)} · ${ago((a.ended || now) - a.started)}${a.toolCount ? ' · ' + dict.toolsCount(a.toolCount) : ''}</span>${a.status === 'working' && a.activity ? `<div class="st">▶ ${esc(a.activity)}</div>` : ''}${a.prompt ? `<div class="st">${esc(a.prompt)}</div>` : ''}</li>`).join('') || `<li>${dict.drawerNone}</li>`}</ul>
    ${replay ? '' : `<button class="btn-remove" id="removeGroup" title="${dict.drawerRemoveTitle}">${dict.drawerRemoveBtn}</button>`}`;
  const top = drawer.scrollTop;
  drawer.style.setProperty('--team', col);
  drawer.innerHTML = h;
  drawer.hidden = false;
  drawer.scrollTop = top;

  const dx = $('drawerX');
  if (dx) dx.onclick = () => { selected = null; render(); };
  const otb = $('openTermFromDrawer');
  if (otb) otb.onclick = () => openTerminal(s.id);
  const rm = $('removeGroup');
  if (rm) {
    rm.onclick = async () => {
      if (!confirm(dict.drawerRemoveConfirm(s.project))) return;
      let r;
      try { r = await fetch('/session-remove?id=' + encodeURIComponent(s.id), { method: 'POST' }); }
      catch(e) { alert(dict.serverUnreachable); return; }
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Lỗi ' + r.status); return; }
      selected = null;
      render();
    };
  }
  drawer.querySelectorAll('.tool-item').forEach(li => {
    li.onclick = () => openTerminal(s.id, li.dataset.toolId);
  });
}

function gantt(agents, now) {
  if (!agents.length) return '';
  const t0 = Math.min(...agents.map(a => a.started)), t1 = Math.max(now, ...agents.map(a => a.ended || now)), span = Math.max(1, t1 - t0);
  const pct = time => ((time - t0) / span * 100).toFixed(2) + '%';
  const runningStr = t().runningNow;
  return `<div class="gantt" aria-label="Gantt timeline">${agents.map(a => {
    const end = a.ended || now;
    return `<div class="row"><span class="nm" title="${esc(a.desc)}">${esc(a.desc)}</span><span class="lane"><span class="span${a.status === 'working' ? ' on' : ''}" style="left:${pct(a.started)};width:calc(${pct(end)} - ${pct(a.started)})" title="${clock(a.started)} → ${a.ended ? clock(a.ended) : runningStr} (${ago(end - a.started)})"></span></span></div>`;
  }).join('')}
    <div class="axis"><span>${clock(t0)}</span><span>${ago(span)}</span><span>${clock(t1)}</span></div></div>`;
}

// ---------- Retro Terminal Inspector ----------
let termColor = localStorage.getItem('agentOfficeTermColor') || 'green';
let termTargetSid = null, termTargetToolId = null;

function renderTerminal() {
  const dict = t();
  const td = $('termDrawer');
  if (td.hidden) return;
  const s = state.sessions.find(x => x.id === (termTargetSid || selected)) || state.sessions[0];
  if (!s) {
    td.innerHTML = `<div class="term-bezel"><div class="term-header"><div class="term-title">AGENT_OS TERMINAL</div><button class="term-close" id="termX">×</button></div><div class="term-screen">${dict.termEmpty}</div></div>`;
    $('termX').onclick = closeTerminal;
    return;
  }
  termTargetSid = s.id;
  const tools = s.tools || [];
  const now = Date.now();
  let runawayAlert = '';
  if (s.runaway) {
    runawayAlert = `<div class="term-alert">
      ${dict.termRunawayAlert}
      &gt; ${esc(s.runaway.msg)}
      &gt; ${dict.termType}: ${esc(s.runaway.type).toUpperCase()} | ${dict.termDetectedAt}: ${clock(s.runaway.at || now)}
    </div>`;
  }
  const banner = `<div class="term-banner">╔══════════════════════════════════════════════════════════════════════════════╗
║ AGENT_OS v1.0.4 • RETRO CRT TERMINAL INSPECTOR                           ║
║ ${dict.termBannerProject}: ${esc(s.project).padEnd(18)} ${dict.termBannerModel}: ${(esc(s.model || s.source || 'claude')).padEnd(12)} ${dict.termBannerStatus}: ${(esc(s.status)).toUpperCase().padEnd(10)}║
║ ${dict.termBannerCwd}: ${(esc(s.cwd || '/workspace/' + s.project)).padEnd(68)}║
╚══════════════════════════════════════════════════════════════════════════════╝</div>`;

  const items = tools.map((item, idx) => {
    const isTarget = termTargetToolId && item.id === termTargetToolId;
    const statusText = item.error ? dict.termExitError : (item.output ? dict.termExitOk : dict.termExitRunning);
    const statusClass = item.error ? 'err' : (item.output ? 'ok' : '');
    const promptLine = `agent@${esc(s.project)}:~$ ${esc(item.text)}`;
    const inputContent = item.input ? `<div class="cmd-body"><span style="opacity:.7">&gt; INPUT:</span>\n${esc(item.input)}</div>` : '';
    const outputContent = item.output ? `<div class="cmd-output"><span style="opacity:.7">&gt; OUTPUT:</span>\n${esc(item.output)}</div>` : '';
    return `<div class="cmd-block${isTarget ? ' target' : ''}" id="cmd-${idx}">
      <div><span class="cmd-time">[${clock(item.at)}]</span><span class="cmd-prompt">${promptLine}</span></div>
      <div class="cmd-meta"><span class="cmd-status ${statusClass}">${statusText}</span><button class="term-btn copy-cmd-btn" data-cmd="${esc(item.input || item.text)}" title="${dict.termCopyCmd}">📋</button></div>
      ${inputContent}
      ${outputContent}
    </div>`;
  }).join('') || `<div style="opacity:.6;padding:20px 0">${dict.termNoCmds}</div>`;

  td.innerHTML = `
    <div class="term-bezel">
      <div class="term-header">
        <div class="term-lights">
          <span class="light red" title="${dict.termLightReady}"></span>
          <span class="light green" title="${dict.termLightRunaway}"></span>
          <span class="light yellow" title="${dict.termLightSSE}"></span>
        </div>
        <div class="term-title">AGENT_OS // CRT_CONSOLE [${esc(s.project)}]</div>
        <div class="term-actions">
          <select id="termSessionSelect" class="board-day" style="padding:2px 6px;font-size:11px">
            ${state.sessions.map(x => `<option value="${esc(x.id)}"${x.id === s.id ? ' selected' : ''}>${esc(x.project)} (${x.status})</option>`).join('')}
          </select>
          <button class="term-btn" id="termColorBtn" title="CRT Phosphor">${termColor === 'green' ? '🟠 Amber' : dict.termBtnColorGreen}</button>
          <button class="term-btn" id="termCopyBtn" title="Copy">${dict.termBtnCopy}</button>
          <button class="term-close" id="termX" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="term-screen${termColor === 'amber' ? ' amber' : ''}" id="termScreen">
        ${banner}
        ${runawayAlert}
        <div id="termLogContent">${items}</div>
        <div style="margin-top:16px;opacity:.7">&gt; <span class="term-cursor" style="animation:screen .8s steps(1) infinite;background:currentColor;display:inline-block;width:8px;height:14px;vertical-align:middle"></span></div>
      </div>
    </div>
  `;

  $('termX').onclick = closeTerminal;
  $('termColorBtn').onclick = () => {
    termColor = termColor === 'green' ? 'amber' : 'green';
    try { localStorage.setItem('agentOfficeTermColor', termColor); } catch(e) {}
    renderTerminal();
  };
  $('termSessionSelect').onchange = e => {
    termTargetSid = e.target.value;
    renderTerminal();
  };
  $('termCopyBtn').onclick = () => {
    const text = tools.map(item => `[${clock(item.at)}] ${item.text}\nINPUT: ${item.input || ''}\nOUTPUT: ${item.output || ''}\n---`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      const b = $('termCopyBtn');
      if (b) {
        b.textContent = dict.termBtnCopied;
        setTimeout(() => { if ($('termCopyBtn')) $('termCopyBtn').textContent = dict.termBtnCopy; }, 1500);
      }
    });
  };
  td.querySelectorAll('.copy-cmd-btn').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      navigator.clipboard.writeText(b.dataset.cmd);
      b.textContent = '✓';
      setTimeout(() => { b.textContent = '📋'; }, 1200);
    };
  });
}

export function openTerminal(sid, toolId) {
  termTargetSid = sid || selected || (state.sessions[0] && state.sessions[0].id);
  termTargetToolId = toolId || null;
  const td = $('termDrawer');
  td.hidden = false;
  renderTerminal();
  if (termTargetToolId) {
    setTimeout(() => {
      const el = td.querySelector('.cmd-block.target');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  } else {
    setTimeout(() => {
      const scr = $('termScreen');
      if (scr) scr.scrollTop = scr.scrollHeight;
    }, 50);
  }
}

export function closeTerminal() {
  $('termDrawer').hidden = true;
  termTargetToolId = null;
}
$('termBtn').onclick = () => {
  const td = $('termDrawer');
  td.hidden ? openTerminal() : closeTerminal();
};

// ---------- Bảng xếp hạng trong ngày ----------
const board = $('board');
let boardTimer = null;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function rankList(title, rows, row) {
  const dict = t();
  return `<h3>${title}</h3><ol class="rank">${rows.length ? rows.map((r, i) => `<li><span class="no">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${row(r)}</li>`).join('') : `<li class="st">${dict.boardNoData}</li>`}</ol>`;
}

async function loadBoard() {
  const dict = t();
  const day = ($('boardDay') && $('boardDay').value) || today();
  let b;
  try { b = await (await fetch('/leaderboard?day=' + day)).json(); }
  catch(e) { board.innerHTML = `<p>${dict.boardLoadErr}</p>`; return; }

  const sub = a => `${person(color(a.team), 'idle', a.id, false, a.type)}<span class="who"><b title="${esc(a.desc)}">${esc(a.desc)}</b><span class="st">${esc(a.project)} · ${esc(a.type)}${a.working ? ' · ' + dict.runningNow : ''}</span></span>`;
  const team = teamObj => `${person(color(teamObj.id), 'idle', teamObj.id, true)}<span class="who"><b>${esc(teamObj.project)}</b><span class="st" title="${esc(teamObj.id)}">${esc(teamObj.model || teamObj.source || '')} · #${esc(teamObj.id.slice(-6))}</span></span>`;
  board.innerHTML = `<button class="x" aria-label="Close" id="boardX">×</button>
    <h2>${dict.boardTitle}</h2>
    <div><input type="date" class="board-day" id="boardDay" value="${b.day}" max="${today()}" aria-label="Date"> <span class="st">${dict.boardSubsEvents(b.subagents, b.events)}</span></div>
    ${rankList(dict.boardLongest, b.longest, a => sub(a) + `<span class="val">${ago(a.ms)}</span>`)}
    ${rankList(dict.boardBusiest, b.busiest, a => sub(a) + `<span class="val">${dict.toolsCount(a.tools)}</span>`)}
    ${rankList(dict.boardTokens, b.tokens, tObj => team(tObj) + `<span class="val">${fmtTok(tObj.tokens)}${tObj.usage && tObj.usage.cost != null ? ' · ' + fmtCost(tObj.usage.cost) : ''}</span>`)}
    ${rankList(dict.boardTeams, b.teams, tObj => team(tObj) + `<span class="val">${dict.toolsCount(tObj.tools)} · ${dict.agentsCount(tObj.agents)}</span>`)}
    <p class="st">${dict.boardFootnote}</p>`;
  $('boardX').onclick = closeBoard;
  $('boardDay').onchange = loadBoard;
}

export function openBoard() {
  board.hidden = false;
  loadBoard();
  clearInterval(boardTimer);
  boardTimer = setInterval(() => { if ($('boardDay').value === today()) loadBoard(); }, 30e3);
}

export function closeBoard() {
  board.hidden = true;
  clearInterval(boardTimer);
  boardTimer = null;
}
$('boardBtn').onclick = () => board.hidden ? openBoard() : closeBoard();

// ---------- Replay từ events.jsonl ----------
function showFrame() {
  state = replay.frames[replay.i];
  $('replaySlider').value = replay.i;
  $('replayLabel').textContent = `${clock(state.now)} (${replay.i + 1}/${replay.frames.length})`;
  render();
}
function stopPlay() {
  if (replay && replay.timer) { clearInterval(replay.timer); replay.timer = null; }
  $('replayPlay').textContent = t().replayPlay;
}
async function startReplay() {
  const dict = t();
  const r = await fetch('/replay?minutes=' + $('replayMin').value);
  const frames = await r.json();
  $('replaybar').hidden = false;
  if (!frames.length) { stopPlay(); replay = null; $('replayLabel').textContent = dict.replayNoLogs; return; }
  stopPlay();
  replay = { frames, i: frames.length - 1, timer: null };
  $('replaySlider').max = frames.length - 1;
  showFrame();
}
function exitReplay() {
  stopPlay(); replay = null; $('replaybar').hidden = true; prev = null;
  state = live; offset = state.now - Date.now(); render();
}
$('replayBtn').onclick = startReplay;
$('replayMin').onchange = startReplay;
$('replayLive').onclick = exitReplay;
$('replaySlider').oninput = e => { if (!replay) return; stopPlay(); replay.i = +e.target.value; showFrame(); };
$('replayPlay').onclick = () => {
  if (!replay) return;
  if (replay.timer) { stopPlay(); return; }
  if (replay.i >= replay.frames.length - 1) replay.i = 0;
  $('replayPlay').textContent = t().replayPause;
  replay.timer = setInterval(() => {
    if (replay.i >= replay.frames.length - 1) { stopPlay(); return; }
    replay.i++;
    showFrame();
  }, 400);
};

// ---------- Quản lý Hook ----------
const hookDrawer = $('hookDrawer');
let hookMsg = '';
async function hookCall(path, opts) {
  try {
    const r = await fetch(path, opts), body = await r.json();
    if (!r.ok) { hookMsg = body.error || ('Lỗi ' + r.status); return null; }
    hookMsg = ''; return body;
  } catch(e) { hookMsg = t().serverUnreachable + ': ' + e.message; return null; }
}
export async function loadHooksUI() {
  hookDrawer.hidden = false;
  renderHooksDrawer(await hookCall('/hooks-status') || []);
}
export function closeHooksUI() { hookDrawer.hidden = true; }
const hookTests = {};
async function hookAction(kind, only) {
  const dict = t();
  if (kind === 'uninstall' && !confirm(dict.hookUninstallConfirm(only))) return;
  hookDrawer.querySelectorAll('button[data-act]').forEach(b => b.disabled = true);
  const res = await hookCall('/hooks-' + kind + (only ? '?only=' + only : ''), { method: 'POST' });
  if (kind === 'test') { if (res) hookTests[only] = res; renderHooksDrawer(await hookCall('/hooks-status') || []); return; }
  const msg = hookMsg, list = res || await hookCall('/hooks-status') || [];
  hookMsg = hookMsg || msg;
  renderHooksDrawer(list);
}
const seenText = tVal => t().hookSeen(tVal ? ago(Date.now() - tVal) : null);
function renderHooksDrawer(items) {
  const dict = t();
  const cards = items.map(it => `
    <div class="hook-item">
      <div class="info"><b>${esc(it.name)}</b><small>${esc(it.file)}</small>${it.error ? `<small style="color:var(--coral)">⚠ ${esc(it.error)}</small>` : it.msg ? `<small>${esc(it.msg)}</small>` : ''}
        <small style="color:${it.lastSeen ? 'var(--mint)' : 'var(--muted)'}">${seenText(it.lastSeen)}</small>
        ${hookTests[it.id] ? `<small style="color:${hookTests[it.id].ok ? 'var(--mint)' : 'var(--coral)'}">${hookTests[it.id].ok ? dict.hookTestOk(hookTests[it.id].ms) : dict.hookTestFail(esc(hookTests[it.id].error))}</small>` : ''}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <span class="hook-badge ${it.installed ? 'on' : 'off'}">${it.error ? dict.hookBadgeError : it.installed ? dict.hookBadgeInstalled : dict.hookBadgeNotInstalled}</span>
        ${it.installed ? `<button class="sound" data-act="test" data-only="${esc(it.id)}" style="padding:4px 8px;font-size:11px" title="${dict.hookTestTitle}">${dict.hookTestBtn}</button>` : ''}
        <button class="sound" data-act="${it.installed ? 'uninstall' : 'install'}" data-only="${esc(it.id)}" style="padding:4px 8px;font-size:11px">${it.installed ? dict.hookUninstallBtn : dict.hookInstallBtn}</button>
      </div>
    </div>`).join('');
  hookDrawer.innerHTML = `
    <button class="x" aria-label="Close" id="hookX">×</button>
    <h2>${dict.hookTitle}</h2>
    <p class="st">${dict.hookIntro}</p>
    ${hookMsg ? `<p style="color:var(--coral)">⚠ ${esc(hookMsg)}</p>` : ''}
    <div class="hook-btn-row">
      <button class="btn-install" data-act="install">${dict.hookInstallAll}</button>
      <button class="btn-uninstall" data-act="uninstall">${dict.hookUninstallAll}</button>
    </div>
    <div id="hookList">${cards}</div>
    <p class="st">${dict.hookAfterInstall}</p>
    <h3>${dict.hookCliTitle}</h3>
    <div class="prompt" style="font-size:11px">node setup-hooks.js --status<br>node setup-hooks.js            # install all<br>node setup-hooks.js --uninstall</div>
    <h3>omp (oh-my-pi)</h3>
    <div class="prompt" style="font-size:11px">omp -e ./omp-office.ts</div>`;
  $('hookX').onclick = closeHooksUI;
  hookDrawer.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => hookAction(b.dataset.act, b.dataset.only));
}
$('hookBtn').onclick = () => hookDrawer.hidden ? loadHooksUI() : closeHooksUI();

// ---------- Nút chuyển đổi ngôn ngữ ----------
const langBtn = $('langBtn');
if (langBtn) {
  langBtn.onclick = () => {
    const curLang = getLang();
    setLang(curLang === 'vi' ? 'en' : 'vi');
    applyStaticLang();
    paintBtn();
    paintNotify();
    render();
    if (!hookDrawer.hidden) loadHooksUI();
    if (!board.hidden) loadBoard();
    if (!$('termDrawer').hidden) renderTerminal();
  };
}

// ---------- Tương tác bàn làm việc & Phím tắt ----------
const floorEl = $('floor');
if (floorEl) {
  floorEl.onclick = e => {
    const p = e.target.closest('[data-sid]');
    if (p) { selected = p.dataset.sid; render(); }
  };
  floorEl.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const p = e.target.closest('[data-sid]');
      if (p) { e.preventDefault(); selected = p.dataset.sid; render(); }
    }
  };
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const td = $('termDrawer');
    if (!hookDrawer.hidden) { closeHooksUI(); }
    else if (!td.hidden) { closeTerminal(); }
    else if (!board.hidden) { closeBoard(); }
    else if (selected) { selected = null; render(); }
  } else if ((e.key === 't' || e.key === 'T') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    const td = $('termDrawer');
    if (td.hidden) openTerminal(); else closeTerminal();
  }
});

// ---------- Nút âm thanh ----------
const soundBtn = $('sound');
if (soundBtn) soundBtn.onclick = toggleSound;

// ---------- Kết nối SSE /events ----------
export function connect() {
  const es = new EventSource('/events');
  es.onopen = () => {
    const bar = $('bar'), conn = $('conn');
    if (bar) bar.classList.remove('off');
    if (conn) conn.textContent = t().connected;
  };
  es.onmessage = e => {
    live = JSON.parse(e.data);
    if (replay) return;
    state = live;
    offset = state.now - Date.now();
    detectChanges(state.sessions);
    render();
  };
  es.onerror = () => {
    const bar = $('bar'), conn = $('conn');
    if (bar) bar.classList.add('off');
    if (conn) conn.textContent = t().connLost;
  };
}

// ---------- Khởi chạy ứng dụng ----------
applyStaticLang();
paintBtn();
paintNotify();
paintFurn();
initMascot();
connect();
setInterval(render, 1000);
