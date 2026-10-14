// ---------- Âm thanh 8-bit ----------
import { t } from './i18n.js';

let audio = null;
export let soundOn = false;
try {
  soundOn = localStorage.getItem('agentOfficeSound') === '1';
} catch(e) {}

export function beep(notes) {
  if (!soundOn || !notes) return;
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  let time = audio.currentTime;
  for (const [f, d] of notes) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(.05, time);
    g.gain.exponentialRampToValueAtTime(.0001, time + d);
    o.connect(g).connect(audio.destination);
    o.start(time);
    o.stop(time + d);
    time += d * .85;
  }
}

export const SOUND = {
  done: [[784, .1], [1047, .22]],
  waiting: [[523, .14], [392, .2]],
  hired: [[660, .07]],
  alarm: [[880, .12], [587, .12], [880, .12], [587, .18]]
};

export function paintBtn() {
  const btn = document.getElementById('sound');
  if (!btn) return;
  btn.setAttribute('aria-pressed', soundOn);
  btn.textContent = soundOn ? t().btnSoundOn : t().btnSoundOff;
}

export function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem('agentOfficeSound', soundOn ? '1' : '0'); } catch(e) {}
  paintBtn();
  if (soundOn) beep(SOUND.done);
}

export function initAudio() {
  const btn = document.getElementById('sound');
  if (btn) btn.onclick = toggleSound;
  paintBtn();
}
