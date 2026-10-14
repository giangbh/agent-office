// ---------- Mascot Controller (Pikachu, Mèo Quản Gia, Eevee, Snorlax) ----------
import { MASCOTS, MASCOT_KEYS } from './sprites.js';
import { getMascotTexts, getLang } from './i18n.js';
import { beep } from './audio.js';

export let currentMascot = MASCOT_KEYS[Math.floor(Math.random() * MASCOT_KEYS.length)];

export let mascotState = {
  pct: 25,
  dir: 1,
  frame: 0,
  wait: 2,
  bubbleTimer: 0,
  text: "",
  sleeping: false
};

export const getCurrentMascot = () => currentMascot;
export const setCurrentMascot = (key) => {
  if (MASCOTS[key]) {
    currentMascot = key;
    updateMascotUI();
  }
};

export function initMascot() {
  const el = document.getElementById('mascot');
  if (!el) return;
  el.onclick = el.onkeydown = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const m = MASCOTS[currentMascot] || MASCOTS.pikachu;
    beep(m.sound);
    const clicks = getMascotTexts(m, 'clickMeows');
    mascotState.text = clicks[Math.floor(Math.random() * clicks.length)] || '';
    mascotState.bubbleTimer = 5;
    mascotState.wait = Math.max(mascotState.wait, 3);
    // Bấm đổi tuần tự qua lại giữa Pikachu, Mèo Quản Gia, Eevee và Snorlax
    const idx = MASCOT_KEYS.indexOf(currentMascot);
    currentMascot = MASCOT_KEYS[(idx + 1) % MASCOT_KEYS.length];
    updateMascotUI();
  };
  updateMascotUI();
}

export function tickMascot(hasWorkingAgents) {
  const el = document.getElementById('mascot');
  if (!el) return;
  const m = MASCOTS[currentMascot] || MASCOTS.pikachu;
  const wasWorking = mascotState.sleeping;
  const curLang = getLang();
  mascotState.sleeping = hasWorkingAgents;

  // Khi phòng vừa hết người làm việc: ngẫu nhiên đổi một bạn mascot mới xuất hiện tuần tra!
  if (wasWorking && !hasWorkingAgents && Math.random() < 0.6) {
    currentMascot = MASCOT_KEYS[Math.floor(Math.random() * MASCOT_KEYS.length)];
  }

  if (mascotState.sleeping) {
    mascotState.pct = 14;
    mascotState.dir = 1;
    mascotState.frame = 2;
    if (mascotState.bubbleTimer > 0) mascotState.bubbleTimer--;
    else if (Math.random() < 0.15) {
      const sleepMsg = m.sleepText
        ? (m.sleepText[curLang] || m.sleepText.vi)
        : (curLang === 'en'
          ? `${m.name} is resting quietly while agents work... 💤`
          : `${m.name} đang ngủ ngoan cho các bạn làm việc... 💤`);
      mascotState.text = Math.random() < 0.5 ? "z Z z" : sleepMsg;
      mascotState.bubbleTimer = 4;
    }
  } else {
    if (mascotState.bubbleTimer > 0) {
      mascotState.bubbleTimer--;
    } else if (Math.random() < 0.22) {
      const patrols = getMascotTexts(m, 'patrolMeows');
      mascotState.text = patrols[Math.floor(Math.random() * patrols.length)] || '';
      mascotState.bubbleTimer = 4;
    }

    if (mascotState.wait > 0) {
      mascotState.wait--;
      mascotState.frame = 0;
    } else {
      mascotState.pct += mascotState.dir * (4 + Math.random() * 3);
      mascotState.frame = mascotState.frame === 0 ? 1 : 0;

      if (mascotState.pct >= 80) {
        mascotState.dir = -1;
        mascotState.wait = Math.floor(2 + Math.random() * 3);
        // Có xác suất ngẫu nhiên đổi bạn mascot khi quay đầu
        if (Math.random() < 0.15) {
          currentMascot = MASCOT_KEYS[Math.floor(Math.random() * MASCOT_KEYS.length)];
        }
      } else if (mascotState.pct <= 14) {
        mascotState.dir = 1;
        mascotState.wait = Math.floor(2 + Math.random() * 3);
      } else if (Math.random() < 0.12) {
        mascotState.wait = Math.floor(2 + Math.random() * 3);
      }
    }
  }
  updateMascotUI();
}

export function updateMascotUI() {
  const el = document.getElementById('mascot');
  const img = document.getElementById('mascotImg');
  const bbl = document.getElementById('mascotBubble');
  if (!el || !img || !bbl) return;

  const m = MASCOTS[currentMascot] || MASCOTS.pikachu;
  const f = m.frames[mascotState.frame] || m.frames[0];
  const curLang = getLang();

  img.src = f.src;
  img.width = f.w;
  img.height = f.h;
  img.alt = m.name;
  el.title = curLang === 'en'
    ? `Mascot ${m.name} ${m.icon} · Click to play or cycle companion!`
    : `Mascot ${m.name} ${m.icon} · Bấm để chơi cùng hoặc đổi bạn mới!`;

  el.style.left = mascotState.pct + '%';
  el.style.transform = `scaleX(${mascotState.dir})`;
  bbl.style.transform = `scaleX(${mascotState.dir})`;

  el.classList.toggle('sleeping', mascotState.sleeping);

  if (mascotState.bubbleTimer > 0 && mascotState.text) {
    bbl.textContent = mascotState.text;
    bbl.classList.add('show');
  } else {
    bbl.classList.remove('show');
  }
}
