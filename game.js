'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#90a4ae', // Nut - steel gray
  '#e040fb', // Power-up - magenta
];

const POWER_EVERY = 5;
const POWERUPS = ['bomb', 'ray', 'dye', 'gravity', 'freeze'];

// ---- Habilidades cargables ----
const ENERGY_MAX = 100;
const ENERGY_PER_CLEAR = [0, 12, 28, 46, 70];   // índice = líneas en un clear (cap a ENERGY_MAX)
const SLOW_MS = 10000;
const SLOW_FACTOR = 3;                           // gravedad 3x más lenta
const QUEUE_LEN = 5;
const ABILITIES = [
  { id: 'peek5', name: 'Ver 5 piezas',       desc: 'Revela las próximas 5 piezas durante 5 colocaciones.' },
  { id: 'swap',  name: 'Intercambiar pieza', desc: 'Cambia la pieza actual por otra aleatoria del pool.' },
  { id: 'slow',  name: 'Ralentizar tiempo',  desc: 'La caída va 3x más lenta durante 10s.' },
  { id: 'undo',  name: 'Deshacer',           desc: 'Revierte tu última colocación.' },
];
const POWERUP_GLYPH = { bomb: '💣', ray: '⚡', dye: '🎨', gravity: '⬇', freeze: '❄' };
const POWERUP_NAME = { bomb: 'BOMBA', ray: 'RAYO', dye: 'TINTE', gravity: 'GRAVEDAD', freeze: 'CONGELAR' };
const FREEZE_MS = 5000;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600];   // índice = líneas limpiadas (0..3)
const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];
const B2B_MULT = 1.5;
const SOUND_KEY = 'tetris-sound';
const CHALLENGE_KEY = 'tetris-challenge';
const GARBAGE_COLOR = 8;

// Modo desafío: cada entrada define objetivo y/o modificador de reglas.
// Flags leídos por el motor: goalLines, timeLimitMs, surviveMs, garbageEveryMs,
// setup(), hideSettled, reverseRotAtLevel, level, dropInterval.
const CHALLENGES = [
  { id: 'classic', name: 'Clásico', desc: 'Juego normal, sin objetivo.' },
  {
    id: 'sprint40', name: 'Sprint 40',
    desc: 'Limpia 40 líneas antes de 2:00.',
    goalLines: 40, timeLimitMs: 120000,
  },
  {
    id: 'garbage', name: 'Basura ascendente',
    desc: 'Sobrevive 90s. Sube una fila de basura cada 10s.',
    surviveMs: 90000, garbageEveryMs: 10000,
  },
  {
    id: 'preset', name: 'Tablero pre-colocado',
    desc: 'Empiezas con basura fija. Limpia 20 líneas.',
    goalLines: 20, setup: setupPreset,
  },
  {
    id: 'invisible', name: 'Piezas invisibles',
    desc: 'La pila desaparece al aterrizar. Limpia 10 líneas.',
    goalLines: 10, hideSettled: true,
  },
  {
    id: 'reverse', name: 'Rotación inversa',
    desc: 'Desde nivel 3 la rotación se invierte. Limpia 40 líneas.',
    goalLines: 40, reverseRotAtLevel: 3, level: 2, dropInterval: 820,
  },
];
const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const powerupEl = document.getElementById('powerup');
const comboEl = document.getElementById('combo');
const soundSwitch = document.getElementById('sound-switch');
const challengeSelect = document.getElementById('challenge-select');
const goalEl = document.getElementById('goal');
const challengeDescEl = document.getElementById('challenge-desc');
const energyFillEl = document.getElementById('energy-fill');
const energyTrackEl = document.getElementById('energy-track');
const energyHintEl = document.getElementById('energy-hint');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const abilityMenu = document.getElementById('ability-menu');
const abilityListEl = document.getElementById('ability-list');
const startMenu = document.getElementById('start-menu');
const startRecordsEl = document.getElementById('start-records');
const startStatsEl = document.getElementById('start-stats');
const playBtn = document.getElementById('play-btn');
const resetRecordsStartBtn = document.getElementById('reset-records-start');
const overlayRecordsEl = document.getElementById('overlay-records');
const overlayStatsEl = document.getElementById('overlay-stats');
const recordEntryEl = document.getElementById('record-entry');
const recordNameEl = document.getElementById('record-name');
const saveRecordBtn = document.getElementById('save-record-btn');
const resetRecordsOverlayBtn = document.getElementById('reset-records-overlay');

const THEME_KEY = 'tetris-theme';
const HISCORE_KEY = 'tetris-hiscores';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let freezeUntil, freezeRemaining, powerPending, nextPowerAt;
let comboCount, b2bActive, b2bCount, lastRotation, flashUntil;
let challenge, challengeTime, garbageAccum, challengeStatus, revealUntil;
let energy, abilityMenuOpen, slowUntil, slowRemaining;
let queue, peekLocks, holdPiece, holdUsed, lastPlacement, runBestCombo;
const effects = [];
let soundOn = true;
let audioCtx = null;
let records = loadRecords();

// ---- Tabla de records local ----
function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISCORE_KEY));
    if (raw && typeof raw === 'object') {
      return {
        top: Array.isArray(raw.top) ? raw.top : [],
        bestCombo: raw.bestCombo || 0,
        maxLines: raw.maxLines || 0,
      };
    }
  } catch (_) { /* json corrupto: usa default */ }
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  localStorage.setItem(HISCORE_KEY, JSON.stringify(records));
}

function qualifiesForTop(s) {
  return records.top.length < 5 || s > records.top[records.top.length - 1].score;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pinta la lista en cualquier contenedor; opts.highlight resalta esa entrada,
// opts.stats es el <p> donde escribir mejor combo / líneas máx.
function renderRecords(container, opts) {
  if (!container) return;
  opts = opts || {};
  if (!records.top.length) {
    container.innerHTML = '<p class="records-empty">Sin records todavía</p>';
  } else {
    container.innerHTML = records.top.map((r, i) => {
      const hl = r === opts.highlight ? ' highlight' : '';
      const combo = Number(r.combo) >= 2 ? ` · x${escapeHtml(r.combo)}` : '';
      return `<div class="record-row${hl}">` +
        `<span class="record-rank">${i + 1}</span>` +
        `<span class="record-name">${escapeHtml(r.name)}</span>` +
        `<span class="record-score">${Number(r.score).toLocaleString()}</span>` +
        `<span class="record-meta">${escapeHtml(r.lines)}L${combo} · ${escapeHtml(r.date)}</span>` +
        `</div>`;
    }).join('');
  }
  if (opts.stats) {
    opts.stats.textContent =
      `Mejor combo: x${records.bestCombo}   ·   Líneas máx: ${records.maxLines}`;
  }
}

function resetRecords() {
  localStorage.removeItem(HISCORE_KEY);
  records = { top: [], bestCombo: 0, maxLines: 0 };
  renderRecords(startRecordsEl, { stats: startStatsEl });
  renderRecords(overlayRecordsEl, { stats: overlayStatsEl });
}

function showStartMenu() {
  renderRecords(startRecordsEl, { stats: startStatsEl });
  startMenu.classList.remove('hidden');
  playBtn.focus();
}

// Al terminar una partida: actualiza stats de por vida, pinta la lista de solo
// lectura y muestra el input si el score entra al top.
function showRecords() {
  records.bestCombo = Math.max(records.bestCombo, runBestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  const canSave = score > 0 && qualifiesForTop(score);
  recordNameEl.value = '';
  recordNameEl.disabled = false;
  saveRecordBtn.disabled = false;
  recordEntryEl.classList.toggle('hidden', !canSave);
  overlayRecordsEl.classList.remove('hidden');
  overlayStatsEl.classList.remove('hidden');
  resetRecordsOverlayBtn.classList.remove('hidden');
  renderRecords(overlayRecordsEl, { stats: overlayStatsEl });
}

function saveRecord() {
  if (saveRecordBtn.disabled) return;
  const entry = {
    name: (recordNameEl.value.trim() || 'ANON').slice(0, 12),
    score,
    lines,
    combo: runBestCombo,
    date: new Date().toISOString().slice(0, 10),
  };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top.length = Math.min(records.top.length, 5);
  records.bestCombo = Math.max(records.bestCombo, runBestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  recordNameEl.disabled = true;
  saveRecordBtn.disabled = true;
  recordEntryEl.classList.add('hidden');
  renderRecords(overlayRecordsEl, { stats: overlayStatsEl, highlight: entry });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  themeSwitch.checked = theme === 'light';
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
}

function initSound() {
  soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  soundSwitch.checked = soundOn;
}

function initChallengeUI() {
  challengeSelect.innerHTML = '';
  for (const c of CHALLENGES) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    challengeSelect.appendChild(opt);
  }
  const saved = localStorage.getItem(CHALLENGE_KEY);
  challengeSelect.value = CHALLENGE_BY_ID[saved] ? saved : 'classic';
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function initAbilityMenu() {
  abilityListEl.innerHTML = '';
  ABILITIES.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    btn.dataset.ability = a.id;
    btn.innerHTML = `<span class="ability-key">${i + 1}</span>` +
      `<span class="ability-text"><b>${a.name}</b><small>${a.desc}</small></span>`;
    btn.addEventListener('click', () => pickAbility(a.id));
    abilityListEl.appendChild(btn);
  });
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

// Copia profunda de una pieza y la coloca en su posición de aparición.
function clonePiece(p) {
  if (!p) return null;
  return {
    ...p,
    shape: p.shape.map(row => row.slice()),
  };
}

function toSpawn(p) {
  p.x = Math.floor(COLS / 2) - Math.floor(p.shape[0].length / 2);
  p.y = 0;
  return p;
}

function makePowerUp() {
  const power = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  return { type: 9, power, shape: [[9]], x: Math.floor(COLS / 2), y: 0 };
}

function nextPiece() {
  if (powerPending) {
    powerPending = false;
    return makePowerUp();
  }
  return randomPiece();
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function rotateCCW(shape) {
  return rotateCW(rotateCW(rotateCW(shape)));
}

function tryRotate() {
  const reverse = challenge && challenge.reverseRotAtLevel && level >= challenge.reverseRotAtLevel;
  const rotated = reverse ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastRotation = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearFullRows() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function boardEmpty() {
  return board.every(row => row.every(v => v === 0));
}

// T-spin: última acción fue rotar, la pieza es la T y >=3 de sus 4
// esquinas diagonales están bloqueadas (borde o celda ocupada).
function detectTSpin() {
  if (current.type !== 3 || !lastRotation) return false;
  const cx = current.x + 1, cy = current.y + 1;
  const corners = [[cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]];
  let filled = 0;
  for (const [x, y] of corners)
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x]) filled++;
  return filled >= 3;
}

function resolveClears(tSpin) {
  const cleared = clearFullRows();

  if (!cleared) {
    if (tSpin) {
      const g = TSPIN_SCORES[0] * level;
      score += g;
      spawnEffect('T-SPIN', COLORS[3], g);
      playSound('tspin');
      flashUntil = performance.now() + 260;
    }
    comboCount = -1;
    updateHUD();
    return;
  }

  comboCount++;
  lines += cleared;
  energy = Math.min(ENERGY_MAX, energy + (ENERGY_PER_CLEAR[cleared] || 0));

  const difficult = cleared === 4 || (tSpin && cleared >= 1);
  const perfect = boardEmpty();

  let base = (tSpin ? TSPIN_SCORES[cleared] : LINE_SCORES[cleared]) || 0;
  const b2bApplied = difficult && b2bActive;
  if (b2bApplied) base *= B2B_MULT;

  const comboMult = comboCount >= 1 ? comboCount + 1 : 1;
  let gained = base * level * comboMult;
  if (perfect) gained += (PERFECT_SCORES[cleared] || 0) * level;
  gained = Math.round(gained);
  score += gained;

  if (difficult) { b2bCount = b2bActive ? b2bCount + 1 : 1; b2bActive = true; }
  else { b2bActive = false; b2bCount = 0; }

  announceClears({ cleared, tSpin, difficult, perfect, b2bApplied, comboMult, gained });

  level = Math.floor(lines / 10) + 1 + (challenge && challenge.level ? challenge.level - 1 : 0);
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  if (lines >= nextPowerAt) {
    powerPending = true;
    nextPowerAt += POWER_EVERY;
  }
  updateHUD();
  checkChallenge();
}

function announceClears(info) {
  const { cleared, tSpin, perfect, b2bApplied, comboMult, gained } = info;
  let label = null, color = '#7aa2f7';

  if (perfect) { label = 'PERFECT CLEAR'; color = COLORS[2]; }
  else if (tSpin) {
    label = cleared === 1 ? 'T-SPIN' : `T-SPIN ${cleared === 2 ? 'DOUBLE' : 'TRIPLE'}`;
    color = COLORS[3];
  } else if (cleared === 4) { label = 'TETRIS'; color = COLORS[1]; }

  if (b2bApplied) label = 'B2B ' + (label || cleared);
  if (label) spawnEffect(label, color, gained);
  if (comboMult >= 2) spawnEffect(`COMBO x${comboMult}`, COLORS[4], 0, 32);

  if (perfect) playSound('perfect');
  else if (cleared === 4) playSound('tetris');
  else if (tSpin) playSound('tspin');
  else if (comboMult >= 2) playSound('combo');
  else playSound('clear');

  if (perfect || cleared === 4 || tSpin || comboMult >= 3)
    flashUntil = performance.now() + 260;
}

// ---- Efectos visuales flotantes ----
function spawnEffect(text, color, points, size) {
  effects.push({
    text,
    sub: points ? '+' + Math.round(points).toLocaleString() : '',
    color: color || '#7aa2f7',
    size: size || 42,
    born: performance.now(),
    dur: 1200,
    slot: effects.length,
  });
}

function drawEffects() {
  const now = performance.now();
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const p = (now - e.born) / e.dur;
    if (p >= 1) { effects.splice(i, 1); continue; }
    const rise = (1 - Math.pow(1 - p, 3)) * 46;
    const alpha = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - e.slot * 46 - rise;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${e.size}px system-ui, -apple-system, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(e.text, cx, cy);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, cx, cy);
    if (e.sub) {
      ctx.font = "700 18px 'Courier New', monospace";
      ctx.strokeText(e.sub, cx, cy + e.size * 0.72);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(e.sub, cx, cy + e.size * 0.72);
    }
    ctx.restore();
  }
}

function drawFlash() {
  const now = performance.now();
  if (now >= flashUntil) return;
  ctx.save();
  ctx.globalAlpha = (flashUntil - now) / 260 * 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ---- Sonido (Web Audio, sin assets) ----
function audio() {
  if (!soundOn) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function blip(freq, start, dur, type, gain) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain || 0.15, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function playSound(kind) {
  if (!soundOn) return;
  if (kind === 'clear') {
    blip(330, 0, 0.12);
  } else if (kind === 'combo') {
    const n = Math.min(Math.max(comboCount, 1), 8);
    blip(300 + n * 85, 0, 0.14, 'square', 0.16);
    blip(450 + n * 110, 0.06, 0.14, 'square', 0.12);
  } else if (kind === 'tetris') {
    blip(400, 0, 0.1); blip(600, 0.08, 0.1); blip(800, 0.16, 0.2);
  } else if (kind === 'tspin') {
    blip(720, 0, 0.1, 'sawtooth', 0.14);
    blip(520, 0.08, 0.1, 'sawtooth', 0.14);
    blip(360, 0.16, 0.22, 'sawtooth', 0.14);
  } else if (kind === 'perfect') {
    [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.09, 0.24, 'triangle', 0.16));
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  snapshotPlacement();
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    lastRotation = false;
    updateHUD();
  } else {
    snapshotPlacement();
    lockPiece();
  }
}

function applyPowerUp(power, ax, ay) {
  if (ay >= 0 && ay < ROWS && ax >= 0 && ax < COLS) board[ay][ax] = 0;
  if (power === 'bomb') pwBomb(ax, ay);
  else if (power === 'ray') pwRay(ax, ay);
  else if (power === 'dye') pwDye();
  else if (power === 'gravity') pwGravity();
  else if (power === 'freeze') freezeUntil = performance.now() + FREEZE_MS;
}

function pwBomb(ax, ay) {
  let hit = 0;
  for (let r = ay - 1; r <= ay + 1; r++)
    for (let c = ax - 1; c <= ax + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c]) {
        board[r][c] = 0;
        hit++;
      }
  score += hit * 10;
}

function pwRay(ax, ay) {
  if (ay < 0 || ay >= ROWS) return;
  board.splice(ay, 1);
  board.unshift(new Array(COLS).fill(0));
  score += 100;
}

function pwDye() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) counts[board[r][c]]++;
  let target = 0;
  for (let v = 1; v < counts.length; v++)
    if (counts[v] > counts[target]) target = v;
  if (!target) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = 0;
  score += counts[target] * 10;
}

function pwGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[write][c] = v;
        write--;
      }
    }
  }
}

function lockPiece() {
  const tSpin = detectTSpin();
  merge();
  if (current.power) applyPowerUp(current.power, current.x, current.y);
  if (challenge && challenge.hideSettled) revealUntil = performance.now() + 500;
  resolveClears(tSpin);
  if ((challenge && challengeStatus !== 'playing') || gameOver) return;
  spawn();
}

function spawn() {
  current = queue.shift();
  queue.push(nextPiece());
  next = queue[0];
  lastRotation = false;
  holdUsed = false;
  if (peekLocks > 0) peekLocks--;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

// ---- Snapshot / deshacer / hold ----
// Se llama en cada ruta de bloqueo ANTES de mutar score/board, para que
// "deshacer" revierta también los puntos de caída rápida.
function snapshotPlacement() {
  if (current.power) return;
  lastPlacement = {
    board: board.map(r => r.slice()),
    current: clonePiece(current),
    queue: queue.map(clonePiece),
    score, lines, level, dropInterval, comboCount, b2bActive, b2bCount,
    nextPowerAt, powerPending, energy, peekLocks,
    holdPiece: clonePiece(holdPiece), holdUsed,
    challengeTime, garbageAccum,
  };
}

function doUndo() {
  const s = lastPlacement;
  if (!s) return;
  board = s.board.map(r => r.slice());
  queue = s.queue.map(clonePiece);
  current = toSpawn(clonePiece(s.current));
  next = queue[0];
  holdPiece = clonePiece(s.holdPiece);
  ({ score, lines, level, dropInterval, comboCount, b2bActive, b2bCount,
     nextPowerAt, powerPending, peekLocks, holdUsed,
     challengeTime, garbageAccum } = s);
  // energy NO se restaura: la habilidad "deshacer" consume la carga completa.
  gameOver = false;
  lastRotation = false;
  lastPlacement = null;
  drawNext();
  drawHold();
  spawnEffect('DESHACER', COLORS[6], 0, 30);
}

function doHold() {
  if (holdUsed || gameOver || paused || abilityMenuOpen) return;
  if (holdPiece) {
    const incoming = toSpawn(clonePiece(holdPiece));
    holdPiece = toSpawn(clonePiece(current));
    current = incoming;
    lastRotation = false;
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    holdPiece = toSpawn(clonePiece(current));
    spawn();
  }
  holdUsed = true;
  drawHold();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  const now = performance.now();
  if (now < freezeUntil) {
    powerupEl.textContent = `❄ ${Math.ceil((freezeUntil - now) / 1000)}s`;
  } else if (next && next.power) {
    powerupEl.textContent = `${POWERUP_GLYPH[next.power]} ${POWERUP_NAME[next.power]}`;
  } else {
    powerupEl.textContent = '—';
  }

  if (comboCount >= 1) runBestCombo = Math.max(runBestCombo, comboCount + 1);

  if (comboCount >= 1 || b2bCount >= 1) {
    const parts = [];
    if (comboCount >= 1) parts.push('x' + (comboCount + 1));
    if (b2bCount >= 1) parts.push('B2B' + (b2bCount >= 2 ? '×' + b2bCount : ''));
    comboEl.textContent = parts.join('  ');
  } else {
    comboEl.textContent = '—';
  }

  goalEl.textContent = challenge ? challengeHud() : '—';

  energyFillEl.style.width = (energy / ENERGY_MAX * 100) + '%';
  const ready = energy >= ENERGY_MAX;
  energyTrackEl.classList.toggle('full', ready);
  const bits = [];
  if (ready) bits.push('LISTA · pulsa E');
  if (now < slowUntil) bits.push(`⏳ ${Math.ceil((slowUntil - now) / 1000)}s`);
  if (peekLocks > 0) bits.push(`👁 ${peekLocks}`);
  energyHintEl.textContent = bits.join('   ') || '—';
}

function challengeHud() {
  const parts = [];
  if (challenge.goalLines) parts.push(`${Math.min(lines, challenge.goalLines)}/${challenge.goalLines} líneas`);
  if (challenge.timeLimitMs) parts.push(`⏳ ${fmtTime(challenge.timeLimitMs - challengeTime)}`);
  else if (challenge.surviveMs) parts.push(`⏱ ${fmtTime(challengeTime)} / ${fmtTime(challenge.surviveMs)}`);
  if (challenge.garbageEveryMs) parts.push(`🗑 ${Math.ceil((challenge.garbageEveryMs - garbageAccum) / 1000)}s`);
  return parts.join('   ') || '—';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGlyph(context, x, y, size, glyph) {
  context.save();
  context.globalAlpha = 1;
  context.fillStyle = 'rgba(0, 0, 0, 0.85)';
  context.font = `${Math.floor(size * 0.62)}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(glyph, x * size + size / 2, y * size + size / 2 + 1);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  const hideStack = challenge && challenge.hideSettled && performance.now() >= revealUntil;

  // board
  if (!hideStack) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawBlock(ctx, c, r, board[r][c], BLOCK);
  }

  // ghost (oculto cuando la pila es invisible: revelaría el aterrizaje)
  if (!hideStack) {
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  }

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.power)
    drawGlyph(ctx, current.x, current.y, BLOCK, POWERUP_GLYPH[current.power]);

  if (peekLocks > 0) drawPeek();
  drawFlash();
  drawEffects();
}

// Franja con las próximas 5 piezas, superpuesta arriba a la derecha del tablero.
function drawPeek() {
  const cell = 12, pad = 8, w = cell * 4 + pad * 2, slot = cell * 3 + 6;
  const x0 = canvas.width - w - 6, y0 = 6;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x0, y0, w, slot * QUEUE_LEN + pad);
  for (let i = 0; i < QUEUE_LEN; i++) {
    const p = queue[i];
    if (!p) continue;
    const sh = p.shape;
    const ox = x0 + pad + (4 - sh[0].length) * cell / 2;
    const oy = y0 + pad + i * slot + (3 - sh.length) * cell / 2;
    for (let r = 0; r < sh.length; r++)
      for (let c = 0; c < sh[r].length; c++)
        if (sh[r][c]) {
          ctx.fillStyle = COLORS[sh[r][c]];
          ctx.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
        }
  }
  ctx.restore();
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!holdPiece) return;
  const shape = holdPiece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const dim = holdUsed ? 0.35 : 1;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, dim);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.power)
    drawGlyph(nextCtx, offX, offY, NB, POWERUP_GLYPH[next.power]);
}

function endGame() {
  if (gameOver) return;
  if (challenge) { endChallenge(false, 'Tablero lleno'); return; }
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showRecords();
}

function endChallenge(won, reason) {
  if (challengeStatus !== 'playing') return;
  challengeStatus = won ? 'won' : 'lost';
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = won ? '¡DESAFÍO SUPERADO!' : 'DESAFÍO FALLIDO';
  const bits = [`${challenge.name}`, `Líneas: ${lines}`, `Tiempo: ${fmtTime(challengeTime)}`];
  if (reason) bits.push(reason);
  overlayScore.textContent = bits.join('  ·  ');
  overlay.classList.remove('hidden');
  showRecords();
  playSound(won ? 'perfect' : 'tspin');
}

function checkChallenge() {
  if (!challenge || challengeStatus !== 'playing') return;
  if (challenge.goalLines && lines >= challenge.goalLines) { endChallenge(true); return; }
  if (challenge.surviveMs && challengeTime >= challenge.surviveMs) { endChallenge(true); return; }
  if (challenge.timeLimitMs && challengeTime >= challenge.timeLimitMs) {
    endChallenge(false, 'Se acabó el tiempo');
  }
}

function addGarbageRow() {
  const hole = Math.floor(Math.random() * COLS);
  const row = new Array(COLS).fill(GARBAGE_COLOR);
  row[hole] = 0;
  const displaced = board.shift();
  board.push(row);
  if (displaced.some(v => v !== 0)) { endChallenge(false, 'La basura te enterró'); return; }
  // el campo sube: la pieza activa sube con él si hay espacio
  if (!collide(current.shape, current.x, current.y - 1)) current.y--;
  else if (collide(current.shape, current.x, current.y)) endChallenge(false, 'La basura te enterró');
}

function setupPreset() {
  for (let r = ROWS - 9; r < ROWS; r++) {
    const gapA = (r * 3) % COLS;
    const gapB = (r * 7 + 4) % COLS;
    for (let c = 0; c < COLS; c++)
      board[r][c] = (c === gapA || c === gapB) ? 0 : ((r + c) % 6) + 1;
  }
}

function togglePause() {
  if (gameOver || abilityMenuOpen) return;
  paused = !paused;
  if (!paused) {
    resumeClock();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    freezeRemaining = Math.max(0, freezeUntil - performance.now());
    slowRemaining = Math.max(0, slowUntil - performance.now());
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

// Reseed lastTime y reanuda los temporizadores congelados (freeze / slow).
function resumeClock() {
  lastTime = performance.now();
  if (freezeRemaining > 0) freezeUntil = lastTime + freezeRemaining;
  if (slowRemaining > 0) slowUntil = lastTime + slowRemaining;
  freezeRemaining = 0;
  slowRemaining = 0;
}

// ---- Menú de habilidades ----
function openAbilityMenu() {
  if (energy < ENERGY_MAX || paused || gameOver || abilityMenuOpen) return;
  abilityMenuOpen = true;
  cancelAnimationFrame(animId);
  freezeRemaining = Math.max(0, freezeUntil - performance.now());
  slowRemaining = Math.max(0, slowUntil - performance.now());
  for (const btn of abilityListEl.children) {
    const id = btn.dataset.ability;
    btn.disabled = (id === 'undo' && !lastPlacement);
  }
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  if (!abilityMenuOpen) return;
  abilityMenuOpen = false;
  abilityMenu.classList.add('hidden');
  resumeClock();
  loop(lastTime);
}

function pickAbility(id) {
  if (!abilityMenuOpen) return;
  const btn = [...abilityListEl.children].find(b => b.dataset.ability === id);
  if (btn && btn.disabled) return;
  abilityMenuOpen = false;
  abilityMenu.classList.add('hidden');
  energy = 0;
  runAbility(id);
  resumeClock();
  updateHUD();
  loop(lastTime);
}

function runAbility(id) {
  if (id === 'peek5') {
    peekLocks = 5;
    spawnEffect('VER x5', COLORS[1], 0, 30);
  } else if (id === 'swap') {
    let p = randomPiece();
    while (p.type === current.type) p = randomPiece();
    if (!collide(p.shape, p.x, p.y)) { current = p; lastRotation = false; }
    spawnEffect('SWAP', COLORS[4], 0, 30);
  } else if (id === 'slow') {
    slowUntil = performance.now() + SLOW_MS;
    spawnEffect('SLOW', COLORS[3], 0, 30);
  } else if (id === 'undo') {
    doUndo();
  }
  playSound('clear');
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = performance.now() < freezeUntil;

  if (challenge && challengeStatus === 'playing' && !frozen) {
    challengeTime += dt;
    if (challenge.garbageEveryMs) {
      garbageAccum += dt;
      if (garbageAccum >= challenge.garbageEveryMs) {
        garbageAccum -= challenge.garbageEveryMs;
        addGarbageRow();
      }
    }
    checkChallenge();
    if (gameOver) return;
  }

  const eff = performance.now() < slowUntil ? dropInterval * SLOW_FACTOR : dropInterval;
  dropAccum += dt;
  if (frozen) {
    dropAccum = 0;
  } else if (dropAccum >= eff) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastRotation = false;
    } else {
      snapshotPlacement();
      lockPiece();
    }
  }
  updateHUD();
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  challenge = CHALLENGE_BY_ID[challengeSelect.value] || null;
  if (challenge && challenge.id === 'classic') challenge = null;

  board = createBoard();
  score = 0;
  lines = 0;
  level = challenge && challenge.level ? challenge.level : 1;
  paused = false;
  gameOver = false;
  dropInterval = challenge && challenge.dropInterval ? challenge.dropInterval : 1000;
  dropAccum = 0;
  lastTime = performance.now();
  freezeUntil = 0;
  freezeRemaining = 0;
  powerPending = false;
  nextPowerAt = POWER_EVERY;
  comboCount = -1;
  runBestCombo = 0;
  b2bActive = false;
  b2bCount = 0;
  lastRotation = false;
  flashUntil = 0;
  effects.length = 0;
  challengeTime = 0;
  garbageAccum = 0;
  challengeStatus = challenge ? 'playing' : 'none';
  revealUntil = 0;
  energy = 0;
  abilityMenuOpen = false;
  slowUntil = 0;
  slowRemaining = 0;
  peekLocks = 0;
  holdPiece = null;
  holdUsed = false;
  lastPlacement = null;

  if (challenge && challenge.setup) challenge.setup();
  challengeDescEl.textContent = challenge ? challenge.desc : '';

  queue = [];
  for (let i = 0; i < QUEUE_LEN; i++) queue.push(nextPiece());
  spawn();
  updateHUD();
  drawHold();
  startMenu.classList.add('hidden');
  overlay.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  overlayStatsEl.classList.add('hidden');
  recordEntryEl.classList.add('hidden');
  resetRecordsOverlayBtn.classList.add('hidden');
  abilityMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (abilityMenuOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') closeAbilityMenu();
    else if (/^(Digit|Numpad)[1-5]$/.test(e.code)) {
      const a = ABILITIES[+e.code.slice(-1) - 1];
      if (a) pickAbility(a.id);
    }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyE') { openAbilityMenu(); return; }
  if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { doHold(); return; }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastRotation = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastRotation = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);
saveRecordBtn.addEventListener('click', saveRecord);
resetRecordsStartBtn.addEventListener('click', resetRecords);
resetRecordsOverlayBtn.addEventListener('click', resetRecords);
themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});
soundSwitch.addEventListener('change', () => {
  soundOn = soundSwitch.checked;
  localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  if (soundOn) playSound('clear');
});
challengeSelect.addEventListener('change', () => {
  localStorage.setItem(CHALLENGE_KEY, challengeSelect.value);
  init();
});

initTheme();
initSound();
initChallengeUI();
initAbilityMenu();
showStartMenu();
