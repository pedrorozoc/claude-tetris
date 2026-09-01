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

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let freezeUntil, freezeRemaining, powerPending, nextPowerAt;
let comboCount, b2bActive, b2bCount, lastRotation, flashUntil;
const effects = [];
let soundOn = true;
let audioCtx = null;

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

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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

function tryRotate() {
  const rotated = rotateCW(current.shape);
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

  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  if (lines >= nextPowerAt) {
    powerPending = true;
    nextPowerAt += POWER_EVERY;
  }
  updateHUD();
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
  resolveClears(tSpin);
  spawn();
}

function spawn() {
  current = next;
  next = nextPiece();
  lastRotation = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
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

  if (comboCount >= 1 || b2bCount >= 1) {
    const parts = [];
    if (comboCount >= 1) parts.push('x' + (comboCount + 1));
    if (b2bCount >= 1) parts.push('B2B' + (b2bCount >= 2 ? '×' + b2bCount : ''));
    comboEl.textContent = parts.join('  ');
  } else {
    comboEl.textContent = '—';
  }
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

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.power)
    drawGlyph(ctx, current.x, current.y, BLOCK, POWERUP_GLYPH[current.power]);

  drawFlash();
  drawEffects();
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
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    if (freezeRemaining > 0) freezeUntil = lastTime + freezeRemaining;
    freezeRemaining = 0;
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    freezeRemaining = Math.max(0, freezeUntil - performance.now());
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = performance.now() < freezeUntil;
  dropAccum += dt;
  if (frozen) {
    dropAccum = 0;
  } else if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastRotation = false;
    } else {
      lockPiece();
    }
  }
  updateHUD();
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  freezeUntil = 0;
  freezeRemaining = 0;
  powerPending = false;
  nextPowerAt = POWER_EVERY;
  comboCount = -1;
  b2bActive = false;
  b2bCount = 0;
  lastRotation = false;
  flashUntil = 0;
  effects.length = 0;
  next = nextPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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
themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});
soundSwitch.addEventListener('change', () => {
  soundOn = soundSwitch.checked;
  localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  if (soundOn) playSound('clear');
});

initTheme();
initSound();
init();
