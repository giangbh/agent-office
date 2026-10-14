// ---------- Đồ hoạ Pixel Art, Nhân vật, Nội thất và Mascots ----------

export function pix(rows, pal, scale = 3) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((p, x) => {
    if (pal[p]) { g.fillStyle = pal[p]; g.fillRect(x, y, 1, 1); }
  }));
  return { src: c.toDataURL(), w: c.width * scale, h: c.height * scale };
}

// Logo Pixel Art của các hãng AI / công cụ
export const LOGOS = {
  claude: pix([
    "....CC....",
    "...CCCC...",
    "...CCCC...",
    "..CCCCCC..",
    "CCCCCCCCCC",
    "CCCCCCCCCC",
    "..CCCCCC..",
    "...CCCC...",
    "...CCCC...",
    "....CC...."
  ], { C: '#E8946A' }, 1.5),

  gemini: pix([
    "....BB....",
    "...bBBb...",
    "...bBBb...",
    "..bbBBbb..",
    "PPPBBPBPPP",
    "PPPBBPBPPP",
    "..bbBBbb..",
    "...bBBb...",
    "...bBBb...",
    "....BB...."
  ], { B: '#4285F4', b: '#7FA7FF', P: '#A855F7' }, 1.5),

  openai: pix([
    "...GGGG...",
    "..GG..GG..",
    ".GG.GG.GG.",
    "GG.GGGG.GG",
    "GG.GGGG.GG",
    ".GG.GG.GG.",
    "..GG..GG..",
    "...GGGG..."
  ], { G: '#10A37F' }, 1.5),

  antigravity: pix([
    "....AA....",
    "...AAAA...",
    "..AA..AA..",
    "..AAAAAA..",
    ".AAAAAAAA.",
    ".AA....AA.",
    "AA......AA"
  ], { A: '#8B5CF6' }, 1.5),

  codex: pix([
    "GGGGGGGGGG",
    "G........G",
    "G..GG....G",
    "G...GG...G",
    "G....GG..G",
    "G...GG...G",
    "G..GG....G",
    "G........G",
    "GGGGGGGGGG"
  ], { G: '#5FD3A8' }, 1.5),

  omp: pix([
    "PPPPPPPPPP",
    "..PP..PP..",
    "..PP..PP..",
    "..PP..PP..",
    "..PP..PP..",
    "..PP...PP."
  ], { P: '#F59E0B' }, 1.5),

  generic: pix([
    "..KKKKKK..",
    ".K.K..K.K.",
    ".KKKKKKKK.",
    ".KK.KK.KK.",
    ".KKKKKKKK.",
    "..KK..KK.."
  ], { K: '#94A3B8' }, 1.5),
};

export const COLORS = ['#FF7A6B', '#5AB0FF', '#B98CFF', '#FFC857', '#4FD1C5', '#FF9ECF', '#9AD45A'];
export const color = id => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

// Nhận diện hãng và logo pixel art tương ứng
export const provider = (m, source) => {
  const text = (String(m || '') + ' ' + String(source || '')).toLowerCase();
  if (/antigravity/.test(text)) return ['Antigravity', '#8B5CF6', 'antigravity'];
  if (/claude|anthropic|opus|sonnet|haiku/.test(text)) return ['Claude', '#E8946A', 'claude'];
  if (/gemini|google/.test(text)) return ['Gemini', '#7FA7FF', 'gemini'];
  if (/codex/.test(text)) return ['Codex', '#5FD3A8', 'codex'];
  if (/gpt|openai|\bo[1-9]/.test(text)) return ['OpenAI', '#5FD3A8', 'openai'];
  if (/omp/.test(text)) return ['omp', '#F59E0B', 'omp'];
  return [m ? m.split('/').pop() : source || 'Agent', '#B6BCCB', 'generic'];
};

export const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
export const fmtCost = c => '$' + (c < 0.01 ? c.toFixed(4) : c.toFixed(2));
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const usageChip = s => {
  const u = s.usage;
  if (!u) return '';
  const tip = `vào ${fmtTok(u.input || 0)} · ra ${fmtTok(u.output || 0)} · cache đọc ${fmtTok(u.cacheRead || 0)} · cache ghi ${fmtTok(u.cacheWrite || 0)}` + (u.cost != null ? ` · ${fmtCost(u.cost)}` : '');
  return `<span class="usage" title="${tip}">${fmtTok((u.input || 0) + (u.output || 0))} tok${u.cost != null ? ' · ' + fmtCost(u.cost) : ''}</span>`;
};

export const engineChip = s => {
  const [name, c, key] = provider(s.model, s.source);
  const logo = LOGOS[key] || LOGOS.generic;
  const label = [s.source === 'claude' ? 'Claude Code' : s.source, s.model || name].filter(Boolean).join(' · ');
  return `<span class="engine" style="--pc:${c}" title="${esc(label)}"><img class="pixel-logo" src="${logo.src}" alt="${esc(name)}"><span>${esc(name)}</span></span>`;
};

// ---------- Pixel art: ghép nhân vật từ nhiều lớp ----------
export const BASE = [
  "............",
  "............",
  "....SSSS....",
  "...SSSSSS...",
  "...SESSES...",
  "...SSSSSS...",
  "....SSSS....",
  "..BBBBBBBB..",
  ".SBBBBBBBBS.",
  ".SBBBBBBBBS.",
  "..BBBBBBBB..",
  "..bbbbbbbb..",
  "...LL..LL...",
  "...LL..LL...",
  "..DDD..DDD.."
];
export const ARMS_UP = [".SBBBBBBBBS.", "..BBBBBBBB..", "..BBBBBBBB.."];
const L = (rows, start = 0) => ({ rows, start });
export const HEADS = {
  cap:     L(["....CCCC....", "...CCCCCC...", "..CCCCCCccc."]),
  beanie:  L([".....ww.....", "...CCCCCC...", "..CCCCCCCC..", "..cccccccc.."]),
  short:   L(["............", "...HHHHHH...", "..HHHHHHHH..", "..H......H.."]),
  spiky:   L(["..H.H..H.H..", "..HHHHHHHH..", "..HHHHHHHH..", "..H......H.."]),
  long:    L(["............", "...HHHHHH...", "..HHHHHHHH..", "..HHHHHHHH..", "..H......H..", "..H......H..", "..HH....HH..", "..HH....HH.."]),
  bun:     L([".....HH.....", "....HHHH....", "...HHHHHH...", "..HH....HH.."]),
  side:    L(["............", "...HHHHHHH..", "..HHHHHHHHH.", "..H.HHHH.H.."]),
  bald:    L(["............", "............", "....SSSS....", "...SSSSSS..."]),
  headset: L(["............", "...HHHHHH...", "..KHHHHHHK..", "..K......K..", ".KK......KK.", ".KK......KK."]),
  helmet:  L(["....yyyy....", "...YYYYYY...", "..YYYYYYYY..", "..yy....yy.."]),
  wizard:  L([".....PP.....", "....PPPP....", "...PPPPPP...", "..PPPPPPPP..", "..pppppppp.."]),
  afro:    L(["...HHHHHH...", "..HHHHHHHH..", ".HHHHHHHHHH.", ".HHHHHHHHHH.", "..H......H.."]),
  retro:   L(["...HHHHHH...", "..HH.HH.HH..", "..HHHHHHHH..", "..H......H..", "..HH....HH.."]),
};
export const FACES = {
  none: L([]), glasses: L(["...GEGGEG..."], 4), shades: L(["...KKKKKK..."], 4),
  beard: L(["...HSSSSH...", "....HHHH...."], 5), stache: L(["....HHHH...."], 5),
  vr: L(["...MMMMMM...", "...mmmmmm..."], 3), nerd: L(["..KEKK.KKEK."], 4),
  mask: L(["....wwww....", "....wwww...."], 5), fullbeard: L(["...HSSSSH...", "..HHSSSSH..", "...HHHHHH..."], 4),
};
export const SHIRTS = {
  plain: L([]), tie: L([".....TT.....", "..BBBTTBBB..", "..BBBTTBBB..", "....TTTT...."], 7),
  stripe: L(["..wwwwwwww.."], 9), hoodie: L(["....w..w....", "....w..w...."], 7),
  collar: L(["....wwww...."], 7), badge: L([".......ww..."], 9),
  hawaii: L(["..B.w..w.B..", ".SBwBwwBwBS.", ".SBBwwBBwBS.", "..B.w..w.B.."], 7),
  suit: L(["..KK.ww.KK..", ".SKK.ww.KKS.", ".SKK.ww.KKS.", "..KK....KK.."], 7),
  sweater: L(["..wwwwwwww..", "..w.ww.w.w..", "..wwwwwwww.."], 7),
};
export const SKINS = ['#F2C29B', '#E0A878', '#C68650', '#8D5A3B', '#FFD9B8', '#6B4430'];
export const HAIRS = ['#2B1E16', '#5A3825', '#A0522D', '#E8C07A', '#C9C9D1', '#D9534F', '#3B5BA5', '#111111'];
export const PANTS = ['#3A3F5C', '#2D4C7A', '#1F1F27', '#7A6A4F', '#4F5D45'];
export const SHOES = ['#1E2233', '#5A3420', '#EDEDED', '#B33A3A'];

export const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');

export function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];

export function traits(seed, leader) {
  const r = rng(seed);
  return {
    head: pickR(r, Object.keys(HEADS)),
    face: r() < .55 ? 'none' : pickR(r, Object.keys(FACES)),
    shirt: leader ? 'tie' : pickR(r, Object.keys(SHIRTS).filter(k => k !== 'tie')),
    skin: pickR(r, SKINS),
    hair: pickR(r, HAIRS),
    pants: pickR(r, PANTS),
    shoes: pickR(r, SHOES),
    capTone: r()
  };
}

export const spriteCache = {};
export function sprite(team, seed, frame, leader) {
  const key = team + seed + frame + leader;
  if (spriteCache[key]) return spriteCache[key];
  const t = traits(seed, leader);
  const cap = t.capTone < .5 ? team : shade(team, .7 + t.capTone * .5);
  const pal = {
    S: t.skin, E: '#2B2233', B: shade(team, .85), b: shade(team, .6), L: t.pants, D: t.shoes, H: t.hair,
    C: cap, c: shade(cap, .72), G: '#E9EEF7', K: '#1A1A22', T: leader ? '#FFC857' : '#C8423B', w: '#F4EEE2',
    Y: '#FFC857', y: '#CCA025', P: '#9333EA', p: '#6B21A8', M: '#38BDF8', m: '#0284C7', R: '#EF4444'
  };
  const grid = BASE.map(r => [...r]);
  if (frame === 1) ARMS_UP.forEach((r, i) => grid[7 + i] = [...r]);
  for (const layer of [HEADS[t.head], FACES[t.face], SHIRTS[t.shirt]])
    layer.rows.forEach((r, i) => [...r].forEach((p, x) => { if (p !== '.') grid[layer.start + i][x] = p; }));
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = grid.length;
  const g = c.getContext('2d');
  grid.forEach((r, y) => r.forEach((p, x) => { if (pal[p]) { g.fillStyle = pal[p]; g.fillRect(x, y, 1, 1); } }));
  return spriteCache[key] = c.toDataURL();
}

export const KINDS = {
  scout: ['🔍', 'Trinh sát'],
  reviewer: ['🖍️', 'Soát lỗi'],
  sonic: ['💨', 'Làm nhanh'],
  builder: ['🔨', 'Thợ xây/Build'],
  debugger: ['🪲', 'Diệt bọ/Fix'],
  writer: ['📜', 'Tài liệu/Doc'],
  security: ['🛡️', 'Bảo mật/Audit']
};

export const kindOf = t => {
  t = String(t || '').toLowerCase();
  if (/scout|explore|find|search/.test(t)) return 'scout';
  if (/review|check|audit|inspect/.test(t)) return /sec|vuln|auth/.test(t) ? 'security' : 'reviewer';
  if (/sonic|quick|fast/.test(t)) return 'sonic';
  if (/build|make|compile|deploy/.test(t)) return 'builder';
  if (/debug|fix|patch|bug/.test(t)) return 'debugger';
  if (/doc|write|read|readme/.test(t)) return 'writer';
  if (/sec|safety|guard/.test(t)) return 'security';
  return '';
};

export const person = (col, state, seed = 'x', leader = false, type = '') => {
  const k = kindOf(type), acc = k && KINDS[k];
  return `<div class="person ${state}${k ? ' k-' + k : ''}"${acc ? ` title="${acc[1]}"` : ''}><img class="f1" alt="" src="${sprite(col, seed, 0, leader)}"><img class="f2" alt="" src="${sprite(col, seed, 1, leader)}">${acc ? `<span class="acc" aria-hidden="true">${acc[0]}</span>` : ''}</div>`;
};

// ---------- Nội thất pixel art ----------
const SOFA = ["..AAAAAAAAAAAA..", ".AaaaaaaaaaaaaA.", "AAaaaaaaaaaaaaAA", "AAAAAAAAAAAAAAAA", "AaaaaaaaaaaaaaaA", "AAAAAAAAAAAAAAAA", ".F............F."];
export const FURN = {
  plant: pix(["..g...g..", ".gGg.gGg.", "gGGgGgGGg", ".gGGGGGg.", "..ggGgg..", "....G....", "..PPPPP..", "..ppppp..", "...ppp..."],
    { g: '#5DBB63', G: '#2F7D3E', P: '#C46A3A', p: '#9A4E2A' }, 4),
  shelf: pix(["WWWWWWWWWW", "WrbgyWrgbW", "WrbgyWrgbW", "WWWWWWWWWW", "WgyrbWbyrW", "WgyrbWbyrW", "WWWWWWWWWW", "WbrWWyggbW", "WbrWWyggbW", "WWWWWWWWWW"],
    { W: '#7A4E2D', r: '#FF7A6B', b: '#5AB0FF', g: '#7BD389', y: '#FFC857' }, 4),
  coffee: pix(["KKKKKKKKKK", "KmmmmmmmmK", "KmRmmmmmmK", "KmmmmmwwmK", "KKKKKKKKKK", ".Kk....kK.", ".Kk.cc.kK.", ".Kk.cc.kK.", "KKKKKKKKKK", "KmmmmmmmmK", "KKKKKKKKKK"],
    { K: '#2A2F45', m: '#9AA6C2', k: '#4A5270', R: '#FF7A6B', w: '#7BD389', c: '#FFF4DE' }, 4),
  cooler: pix(["...BBB...", "..BBBBB..", "..BBBBB..", "...BBB...", "..WWWWW..", "..Wr.bW..", "..W...W..", "..WWWWW..", "..WWWWW..", "..WWWWW..", "..KK.KK.."],
    { B: '#38BDF8', b: '#0284C7', W: '#E2E8F0', r: '#EF4444', K: '#475569' }, 4),
  fridge: pix(["SSSSSSSSSS", "SssssssssS", "SssssssssS", "SKsssssssS", "SSSSSSSSSS", "SSSSSSSSSS", "SsyysssssS", "SKyysssssS", "SssssssssS", "SssssssssS", "SssssssssS", "KKKKKKKKKK"],
    { S: '#94A3B8', s: '#CBD5E1', K: '#334155', y: '#FDE047' }, 4),
  server: pix(["KKKKKKKKKK", "Kggy.r..gK", "KmmmmmmmmK", "KKKKKKKKKK", "K.rr.g.gyK", "KmmmmmmmmK", "KKKKKKKKKK", "Ky.g.rr.gK", "KmmmmmmmmK", "KKKKKKKKKK", "K.gg.y.rrK", "KmmmmmmmmK", "KKKKKKKKKK", "KK......KK"],
    { K: '#0F172A', m: '#334155', g: '#22C55E', r: '#EF4444', y: '#FACC15' }, 4),
  vending: pix(["KKKKKKKKKKKK", "KwwwwwwwwwwK", "Kw.SODA..wK", "KKKKKKKKKKKK", "K.r.g.b.y..K", "K.r.g.b.y..K", "KKKKKKKKKKKK", "K.b.r.y.g..K", "K.b.r.y.g..K", "KKKKKKKKKKKK", "Kmm.y...mmmK", "K...k......K", "KKKKKKKKKKKK", "KK........KK"],
    { K: '#1E293B', w: '#F8FAFC', r: '#EF4444', g: '#22C55E', b: '#38BDF8', y: '#FACC15', m: '#475569', k: '#020617' }, 4),
  whiteboard: pix(["WWWWWWWWWWWWWW", "W............W", "W.rrr..ggg...W", "W..|....|....W", "W.bbbbbbbb...W", "W............W", "WWWWWWWWWWWWWW", "....A....A....", "...A......A...", "..A........A.."],
    { W: '#94A3B8', '.': '#F8FAFC', r: '#EF4444', g: '#22C55E', b: '#38BDF8', A: '#475569' }, 4),
  bin: pix([".GGGGGGG.", "GGGGGGGGG", ".GwwwwwG.", ".G.w.w.G.", ".GwwwwwG.", ".G.w.w.G.", "..GGGGG.."],
    { G: '#15803D', w: '#86EFAC' }, 4),
  sofa: pix(SOFA, { A: '#B5546A', a: '#D9728A', F: '#3A2A22' }, 6),
  napsofa: pix(SOFA, { A: '#4A5C9A', a: '#6B80C4', F: '#141828' }, 6),
};

export function paintFurn() {
  document.querySelectorAll('[data-furn]').forEach(el => {
    const f = FURN[el.dataset.furn];
    if (f) { el.src = f.src; el.width = f.w; el.height = f.h; }
  });
}

// ---------- Mascot Văn Phòng (Mèo Quản Gia 🐱 + Pikachu ⚡ + Eevee 🦊 + Snorlax 💤) ----------
export const MASCOTS = {
  cat: {
    name: 'Mèo Quản Gia',
    icon: '🐱',
    scale: 3.5,
    frames: [
      pix([
        "K...........K...",
        "KK.........KK...",
        "KYY.......YYK...",
        ".KYY.....YYK....",
        "..KYYYYYYYK.....",
        "..KYYYYYYYK.....",
        ".KKYEYYEYKKK....",
        ".KYYYYYYYYKK....",
        "..bBYYYYYYK.Y...",
        ".YYYYWWYYYYKYY..",
        ".YYKYYYYKYYKYY..",
        ".YYYYYYYYYYKYY..",
        "..KYYYYYYK.K....",
        "..KYY.YYK.......",
        "..KWW.WWK.......",
        "..KK...KK......."
      ], { K: '#1E293B', Y: '#F97316', E: '#059669', W: '#FFFFFF', B: '#FACC15', b: '#EF4444' }, 3.5),

      pix([
        ".K.........K....",
        "KKK.......KKK...",
        "KYYK.....KYYK...",
        ".KYYK...KYYK....",
        "..KYYYYYYYK.....",
        "..KYYYYYYYK..Y..",
        ".KKYEYYEYKKKYY..",
        ".KYYYYYYYYKKYY..",
        "..bBYYYYYYK.YY..",
        ".YYYYWWYYYYKK...",
        ".YYKYYYYKYY.....",
        "..KYYYYYYK......",
        "..KYY..YK.......",
        "..KWW..WK.......",
        "..KK...KK.......",
        "................"
      ], { K: '#1E293B', Y: '#F97316', E: '#059669', W: '#FFFFFF', B: '#FACC15', b: '#EF4444' }, 3.5),

      pix([
        "................",
        "................",
        "................",
        ".....K.....K....",
        "....KKK...KKK...",
        "...KYYK...KYYK..",
        "..KYYYYYYYKKYY..",
        ".KKY-EY-EKKKYY..",
        ".KYYYYYYYYKK....",
        "..bBYYYYYYYY....",
        ".YYYYWWYYYYYY...",
        ".YYYWWWWYYYYYY..",
        "..KYYYYYYYYYK...",
        "...KWWWWWWKK....",
        "................",
        "................"
      ], { K: '#1E293B', Y: '#F97316', E: '#059669', W: '#FFFFFF', B: '#FACC15', b: '#EF4444' }, 3.5)
    ],
    patrolMeows: {
      vi: [
        "Meow~ Văn phòng yên ắng quá! ✨",
        "Chờ sếp giao task mới! ☕",
        "Meow~ Đang quét dọn sàn nhà 🧹",
        "Đang canh chừng bug... 🪲",
        "Kiểm tra bảng trắng: sạch bóng! 📋",
        "Ai cho xin hạt cá hồi đi~ 🐟",
        "Meow meow~ Chúc sếp ngày vui! 💖",
        "Pantry có bánh cá không ta? 🥛"
      ],
      en: [
        "Meow~ The office is so quiet and peaceful! ✨",
        "Waiting for boss to assign new tasks! ☕",
        "Meow~ Sweeping the workspace floor 🧹",
        "Keeping a watchful eye for tricky bugs... 🪲",
        "Whiteboard status: sparkling clean! 📋",
        "Anyone got salmon treats meow? 🐟",
        "Meow meow~ Have a fantastic day, boss! 💖",
        "Wonder if there are fish snacks in the pantry? 🥛"
      ]
    },
    clickMeows: {
      vi: [
        "Meowww! ✨ Bạn vừa xoa đầu mèo!",
        "Purrrrr~ 🐾 Yêu sếp nhất trần đời!",
        "Ngoan ngoãn trực văn phòng nè! 💖",
        "(=^･ω･^=) Bấm tiếp để gọi bạn Pokémon nhé! ⚡",
        "Ting ting! Chúc bạn code không bao giờ bug! 🍀"
      ],
      en: [
        "Meowww! ✨ You gave Butler Cat a gentle headpat!",
        "Purrrrr~ 🐾 Best boss ever!",
        "On duty guarding the office! 💖",
        "(=^･ω･^=) Click again to switch to Pokémon companions! ⚡",
        "Ting ting! Wishing you clean, bug-free commits today! 🍀"
      ]
    },
    sound: [[784, 0.06], [1046, 0.12], [1318, 0.18]]
  },

  pikachu: {
    name: 'Pikachu',
    icon: '⚡',
    scale: 3.5,
    frames: [
      pix([
        "K...........K...",
        "KK.........KK...",
        "KYY.......YYK...",
        ".KYY.....YYK....",
        "..KYYYYYYYK.....",
        "..KYYYYYYYK.K...",
        ".KKYBYYBYKKKKY..",
        ".KRYWYYWRYKKYY..",
        ".KYYYYYYYYKKYY..",
        "..KYYYYYYK.KYY..",
        ".KYYYYYYYYKK....",
        ".KYKYYYYKYK.K...",
        ".KYYBBYYKKKYY...",
        "..KYYYYYK.KYY...",
        "..KYY.YYK..K....",
        "..KK...KK......."
      ], { K: '#0F172A', Y: '#FACC15', R: '#EF4444', B: '#78350F', W: '#FFFFFF' }, 3.5),

      pix([
        ".K.........K....",
        "KKK.......KKK...",
        "KYYK.....KYYK...",
        ".KYYK...KYYK....",
        "..KYYYYYYYK.....",
        "..KYYYYYYYK..K..",
        ".KKYBYYBYKKKKYY.",
        ".KRYWYYWRYKKYY..",
        ".KYYYYYYYYKKYY..",
        "..KYYYYYYK..KK..",
        ".KYYYYYYYYKK....",
        ".KYKYYYYKYK.K...",
        "..KYBBYYYKKYY...",
        "..KYY..YK.KYY...",
        "..KK...KK..K....",
        "................"
      ], { K: '#0F172A', Y: '#FACC15', R: '#EF4444', B: '#78350F', W: '#FFFFFF' }, 3.5),

      pix([
        "................",
        "................",
        "................",
        "................",
        ".....K.....K....",
        "....KKK...KKK...",
        "...KYYK...KYYK..",
        "..KYYYYYYYKKYY..",
        ".KKYBBYBKKKKYY..",
        ".KRYYYYYWRYKK...",
        ".KYYYYYYYYYK....",
        "..KYYYYYYYYYK...",
        "..KYYYYYYBBYK...",
        "...KKKKKKKKK....",
        "................",
        "................"
      ], { K: '#0F172A', Y: '#FACC15', R: '#EF4444', B: '#78350F', W: '#FFFFFF' }, 3.5)
    ],
    patrolMeows: {
      vi: [
        "Pika pika! ⚡",
        "Pikachu đang nạp điện cho văn phòng! ⚡",
        "Pika-chuuu! Chờ sếp giao task mới! 🎮",
        "Đang tìm bug để giật điện nè! 🪲⚡",
        "Pikapi! Văn phòng sạch bóng! ✨",
        "Pika? Cà phê xong chưa ta? ☕",
        "Pikachu vẫy đuôi tia sét chào sếp! ⚡"
      ],
      en: [
        "Pika pika! ⚡",
        "Pikachu is charging up the office! ⚡",
        "Pika-chuuu! Ready for new tasks, boss! 🎮",
        "Hunting bugs with Thunder Shock! 🪲⚡",
        "Pikapi! Office looks spotless! ✨",
        "Pika? Is the coffee ready? ☕",
        "Pikachu wags lightning tail at boss! ⚡"
      ]
    },
    clickMeows: {
      vi: [
        "⚡ THUNDERBOLT! Giật điện tan biến mọi bug! ⚡",
        "Pika pikaaa! (Cảm ơn sếp đã xoa đầu) 💖",
        "Pikachu sẵn sàng chiến đấu cùng AI! ⚡",
        "Bấm tiếp để đổi sang bạn khác nhé! ✨"
      ],
      en: [
        "⚡ THUNDERBOLT! Zapping away all bugs! ⚡",
        "Pika pikaaa! (Thank you for the headpat!) 💖",
        "Pikachu is ready to code with AI agents! ⚡",
        "Click again to switch companions! ✨"
      ]
    },
    sound: [[659, 0.08], [880, 0.08], [1318, 0.18]]
  },

  eevee: {
    name: 'Eevee',
    icon: '🦊',
    scale: 3.5,
    frames: [
      pix([
        "K...........K...",
        "KK.........KK...",
        "Knn.......nnK...",
        ".Knn.....nnK....",
        "..KnnnnnnnK.....",
        "..KnnnnnnnK.....",
        ".KKnEnnEnKKK....",
        ".KnnnnnnnnKK....",
        "..KWWWWWWK.Wn...",
        ".KWWWWWWWWKWnn..",
        ".KnKnnnnKnKWnn..",
        ".KnnnnnnnnKWn...",
        "..KnnnnnnK......",
        "..Knn.nnK.......",
        "..KK...KK.......",
        "................"
      ], { K: '#1E293B', n: '#B45309', E: '#1E293B', W: '#FEF3C7' }, 3.5),

      pix([
        ".K.........K....",
        "KKK.......KKK...",
        "KnnK.....KnnK...",
        ".KnnK...KnnK....",
        "..KnnnnnnnK.....",
        "..KnnnnnnnK..Wn.",
        ".KKnEnnEnKKKWnn.",
        ".KnnnnnnnnKKWnn.",
        "..KWWWWWWK..Wn..",
        ".KWWWWWWWWKK....",
        ".KnKnnnnKnK.....",
        "..KnnnnnnK......",
        "..Knn..nK.......",
        "..KK...KK.......",
        "................",
        "................"
      ], { K: '#1E293B', n: '#B45309', E: '#1E293B', W: '#FEF3C7' }, 3.5),

      pix([
        "................",
        "................",
        "................",
        ".....K.....K....",
        "....KKK...KKK...",
        "...KnnK...KnnK..",
        "..KnnnnnnnK.....",
        ".KKnEnnEnKKK....",
        ".KnnnnnnnnKK.Wn.",
        "..KWWWWWWWWKWnn.",
        "..KnnnnnnnnKK...",
        "...KKKKKKKKK....",
        "................",
        "................",
        "................",
        "................"
      ], { K: '#1E293B', n: '#B45309', E: '#1E293B', W: '#FEF3C7' }, 3.5)
    ],
    patrolMeows: {
      vi: [
        "Eevui! 🌸",
        "Eevee đang đi dạo quanh văn phòng~ ✨",
        "Văn phòng hôm nay yên tĩnh quá! 💤",
        "Eevee muốn tiến hóa thành Jolteon! ⚡",
        "Sếp ơi giao việc cho AI đi nà! 🚀",
        "Eevee vẫy chiếc đuôi bồng bềnh! 🐾"
      ],
      en: [
        "Eevui! 🌸",
        "Eevee is happily strolling around the office~ ✨",
        "The office is wonderfully calm and cozy! 💤",
        "Eevee dreams of evolving into Jolteon! ⚡",
        "Eevee swishes its fluffy tail with excitement! 🐾"
      ]
    },
    clickMeows: {
      vi: [
        "Eevui vui sướng vẫy đuôi! 🐾",
        "Eevee ôm chân sếp cảm ơn nè! 💖",
        "Tung tăng chạy nhảy quanh văn phòng! ✨",
        "Bấm tiếp để đổi sang bạn Snorlax béo tròn nhé! 💤"
      ],
      en: [
        "Eevui wags its tail with pure delight! 🐾",
        "Eevee happily hugs boss's leg! 💖",
        "Trotting cheerfully across the workspace! ✨",
        "Click again to switch to Snorlax! 💤"
      ]
    },
    sound: [[587, 0.08], [880, 0.12], [1174, 0.16]]
  },

  snorlax: {
    name: 'Snorlax',
    icon: '💤',
    scale: 2,
    frames: [
      pix([
        "........KK.......KK........",
        ".......KTTKK...KKTTK.......",
        ".......KTTTKTTTKTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        "......KTTDTBTTTTBTTTK......",
        "......KTTBBBTTTBBBTTK......",
        "......KTBBBBBTBBBBBTK......",
        ".....KKTBBBBBBBBBBBTKK.....",
        "...KDTDKSKDNBBBNDKSKDTD....",
        "..KTDTTDSSBBBBBBBSSDTTTK...",
        ".KTTTTTDTSSWSSSWSSTTTTTTK..",
        "KTTTTDTTTTNSSSSSNTTTDTTTK..",
        "KPTTTTKTTSSBBBBBSSTTTDTTTK.",
        "KTPTKKTTSBBBBBBBBBSTTTTDTK.",
        ".KKKDTTBBBBBBBBBBBBBTTDDKK.",
        "..KDDDDTBBBBBBBBBBBBDDDDK..",
        "..KDDDDSBBBBBBBBBBBBSDDDK..",
        "...KDDSSBBBBBBBBBBBSSDDK...",
        "...KDDSSSSBBBBBBBSSSSDDK...",
        "...KKDSSSSSSSSSSSSSSSDKK...",
        "....KDNSSSSSSSSSSSSSNDK....",
        ".....KKKSSSSSSSSSSSKKK.....",
        ".....DNNKKKKKKKKKKKNND.....",
        "......KKKKD.....DNPSPK.....",
        ".................KKKK......"
      ], {
        K: '#111827',
        D: '#284B5B',
        T: '#4D8699',
        L: '#73AAB9',
        B: '#FDE6A6',
        S: '#D0A159',
        E: '#5A3825',
        W: '#FFFFFF',
        P: '#9F9EB8',
        N: '#A86835'
      }, 2),

      pix([
        "........KK.......KK........",
        ".......KTTKK...KKTTK.......",
        ".......KTTTKTTTKTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        "......KTTDTBTTTTBTTTK......",
        "......KTTBBBTTTBBBTTK......",
        "......KTBBBBBTBBBBBTK......",
        ".....KKTBBBBBBBBBBBTKK.....",
        "...KDTDKSKDNBBBNDKSKDTD....",
        "..KTDTTDSSBBBBBBBSSDTTTK...",
        ".KTTTTTDTSSWSSSWSSTTTTTTK..",
        "KTTTTDTTTTNSSSSSNTTTDTTTK..",
        "KPTTTTKTTSSBBBBBSSTTTDTTTK.",
        "KTPTKKTTSBBBBBBBBBSTTTTDTK.",
        ".KKKDTTBBBBBBBBBBBBBTTDDKK.",
        "..KDDDDTBBBBBBBBBBBBDDDDK..",
        "..KDDDDSBBBBBBBBBBBBSDDDK..",
        "...KDDSSBBBBBBBBBBBSSDDK...",
        "...KDDSSSSBBBBBBBSSSSDDK...",
        "...KKDSSSSSSSSSSSSSSSDKK...",
        "....KDNSSSSSSSSSSSSSNDK....",
        ".....KKKSSSSSSSSSSSKKK.....",
        "......DNNKKKKKKKKKKKNND....",
        ".......KKKKD...DNPSPK......",
        "................KKKK......."
      ], {
        K: '#111827',
        D: '#284B5B',
        T: '#4D8699',
        L: '#73AAB9',
        B: '#FDE6A6',
        S: '#D0A159',
        E: '#5A3825',
        W: '#FFFFFF',
        P: '#9F9EB8',
        N: '#A86835'
      }, 2),

      pix([
        "...........................",
        "...........................",
        "........KK.......KK........",
        ".......KTTKK...KKTTK.......",
        ".......KTTTKTTTKTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        ".......KTTTTTTTTTTTK.......",
        "......KTTDTBTTTTBTTTK......",
        "......KTTBBBTTTBBBTTK......",
        "......KTBBBBBTBBBBBTK......",
        ".....KKTBBBBBBBBBBBTKK.....",
        "...KDTDKKKDNBBBNDKKKDTD....",
        "..KTDTTDSSBBBBBBBSSDTTTK...",
        ".KTTTTTDTSSWSSSWSSTTTTTTK..",
        "KTTTTDTTTTNSSSSSNTTTDTTTK..",
        "KPTTTTKTTSSBBBBBSSTTTDTTTK.",
        "KTPTKKTTSBBBBBBBBBSTTTTDTK.",
        ".KKKDTTBBBBBBBBBBBBBTTDDKK.",
        "..KDDDDTBBBBBBBBBBBBDDDDK..",
        "..KDDDDSBBBBBBBBBBBBSDDDK..",
        "...KDDSSBBBBBBBBBBBSSDDK...",
        "...KDDSSSSBBBBBBBSSSSDDK...",
        "...KKDSSSSSSSSSSSSSSSDKK...",
        "....KDNSSSSSSSSSSSSSNDK....",
        ".....KKKSSSSSSSSSSSKKK.....",
        "......DNNKKKKKKKKKKKNND...."
      ], {
        K: '#111827',
        D: '#284B5B',
        T: '#4D8699',
        L: '#73AAB9',
        B: '#FDE6A6',
        S: '#D0A159',
        E: '#5A3825',
        W: '#FFFFFF',
        P: '#9F9EB8',
        N: '#A86835'
      }, 2)
    ],
    patrolMeows: {
      vi: [
        "Snoooor... lax! 💤",
        "Snorlax đang đi dạo tìm đồ ăn vặt quanh văn phòng~ 🍙",
        "Bụng Snorlax đang reo ùng ục rồi nè! 🍔",
        "Ai có bánh ngọt ở Pantry không cho xin một miếng! ☕",
        "Lạch bạch lạch bạch... Đi bộ một tí cho tiêu mỡ! 🐾",
        "Snorlax nằm cản đường một tí thôi nha sếp! 💤"
      ],
      en: [
        "Snoooor... lax! 💤",
        "Snorlax is lumbering around sniffing for snacks~ 🍙",
        "My tummy is rumbling so loud! 🍔",
        "Anyone got donuts or pizza in the pantry? ☕",
        "Waddle waddle... Walking off that big lunch! 🐾",
        "Snorlax might block the hallway for a quick nap! 💤"
      ]
    },
    clickMeows: {
      vi: [
        "Snorlax lim dim mắt dụi đầu vào sếp! 💖",
        "Oáp~ Tiếng ngáy rung chuyển cả sàn văn phòng! 💤",
        "Snorlax được sếp xoa chiếc bụng béo thích mê! ✨",
        "Bấm tiếp để đổi sang bạn Pikachu nhé! ⚡"
      ],
      en: [
        "Snorlax happily yawns and rubs its sleepy head! 💖",
        "Zzz... A mighty snore echoes through the office! 💤",
        "Snorlax loves belly rubs from boss! ✨",
        "Click again to switch back to Pikachu! ⚡"
      ]
    },
    sleepText: {
      vi: "Snorlax đang ngủ say tít như khúc gỗ cản đường... 💤",
      en: "Snorlax is sleeping deeply like a cozy giant boulder... 💤"
    },
    sound: [[330, 0.12], [392, 0.12], [494, 0.14], [440, 0.24]]
  }
};

export const MASCOT_KEYS = ['pikachu', 'cat', 'eevee', 'snorlax'];
