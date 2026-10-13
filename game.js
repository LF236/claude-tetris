'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // 1 I - cyan
  '#ffd54f', // 2 O - yellow
  '#ba68c8', // 3 T - purple
  '#81c784', // 4 S - green
  '#e57373', // 5 Z - red
  '#90caf9', // 6 J - pale blue
  '#ffb74d', // 7 L - orange
  '#b0bec5', // 8 Nut - metallic silver
  '#ffd700', // 9 Wildcard - gold
  '#ff5722', // 10 Bomb
  '#ffe066', // 11 Lightning
  '#f48fb1', // 12 Tint
  '#00e5ff', // 13 Gravity
  '#b3e5fc', // 14 Freeze
  '#e040fb', // 15 Plus - magenta
  '#26c6da', // 16 U - teal
  '#aed581', // 17 Y - lime
  '#ffffff', // 18 Mono (1×1) - white
  '#ff6e40', // 19 Challenge (3×3) - deep orange
];

const WILDCARD = 9;
const POWERS = { BOMB: 10, LIGHTNING: 11, TINT: 12, GRAVITY: 13, FREEZE: 14 };
const POWER_INTERVAL = 2;
const PENTOMINOS = [15, 16, 17];
const MONO = 18;
const CHALLENGE = 19;
const POWER_NAMES = { 10: 'BOMBA', 11: 'RAYO', 12: 'TINTE', 13: 'GRAVEDAD', 14: 'CONGELAR' };
const POWER_SYMBOLS = { 10: '💣', 11: '⚡', 12: '🎨', 13: '🌊', 14: '❄' };

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut
  null,                                        // 9 Wildcard (board-only)
  [[10]],                                      // Bomb
  [[11]],                                      // Lightning
  [[12]],                                      // Tint
  [[13]],                                      // Gravity
  [[14]],                                      // Freeze
  [[0,15,0],[15,15,15],[0,15,0]],              // Plus (+)
  [[16,0,16],[16,16,16]],                      // U
  [[0,17],[17,17],[0,17],[0,17]],              // Y
  [[18]],                                      // Mono (1×1)
  [[19,19,19],[19,0,19],[19,19,19]],           // Challenge (3×3 hollow)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, boardHoles;
let pendingPower, pendingMono, frozenUntil, powerAnim;
let combo, lastWasDifficult, lastWasRotate, floatTexts, audioCtx;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 8) + 1);
}

function nextPiece() {
  if (pendingMono) {
    pendingMono = false;
    return makePiece(MONO);
  }
  if (pendingPower) {
    pendingPower = false;
    return powerPiece();
  }
  const roll = Math.random();
  if (roll < 0.03) return makePiece(CHALLENGE);
  if (roll < 0.18) return makePiece(PENTOMINOS[Math.floor(Math.random() * PENTOMINOS.length)]);
  return randomPiece();
}

function powerPiece() {
  const pool = [POWERS.BOMB, POWERS.LIGHTNING, POWERS.TINT, POWERS.GRAVITY, POWERS.FREEZE];
  const type = pool[Math.floor(Math.random() * pool.length)];
  return { type, shape: [[type]], x: Math.floor(COLS / 2), y: 0, isPower: true };
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
      lastWasRotate = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
  if (current.type === 8)
    boardHoles.add(`${current.y + 1},${current.x + 1}`);
}

function purgeStaleHoles() {
  for (const key of [...boardHoles]) {
    const [r, c] = key.split(',').map(Number);
    const ok =
      board[r-1]?.[c-1] === 8 && board[r-1]?.[c] === 8 && board[r-1]?.[c+1] === 8 &&
      board[r]?.[c-1]   === 8 &&                           board[r]?.[c+1]   === 8 &&
      board[r+1]?.[c-1] === 8 && board[r+1]?.[c] === 8 && board[r+1]?.[c+1] === 8;
    if (!ok) boardHoles.delete(key);
  }
}

function clearLines(tspin = null, fromPower = false) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    const empties  = board[r].filter(v => v === 0).length;
    const wildcards = board[r].filter(v => v === WILDCARD).length;
    if (empties <= wildcards) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      const newHoles = new Set();
      for (const key of boardHoles) {
        const [hr, hc] = key.split(',').map(Number);
        newHoles.add(hr < r ? `${hr + 1},${hc}` : key);
      }
      boardHoles = newHoles;
      cleared++;
      r++;
    }
  }

  if (!cleared) {
    if (!fromPower) { combo = 0; lastWasDifficult = false; }
    return 0;
  }

  const prevMilestone = Math.floor(lines / POWER_INTERVAL);
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  if (Math.floor(lines / POWER_INTERVAL) > prevMilestone) pendingPower = true;

  const perfectClear = board.every(row => row.every(v => v === 0));
  const isDifficult = cleared >= 4 || !!tspin;
  const b2b = isDifficult && lastWasDifficult;

  if (!fromPower) combo++;
  const comboMult = Math.min(combo, 8);

  let baseScore = 0;
  let label = '';
  let labelColor = '#ffffff';

  if (tspin === 'tspin') {
    const tspinScores = [0, 200, 1200, 1600];
    baseScore = (tspinScores[Math.min(cleared, 3)] || 400) * level;
    label = (['', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'])[Math.min(cleared, 3)] || 'T-SPIN';
    labelColor = '#ce93d8';
  } else if (tspin === 'mini') {
    baseScore = ([0, 100, 400][Math.min(cleared, 2)] || 200) * level;
    label = 'T-SPIN MINI';
    labelColor = '#ce93d8';
  } else {
    baseScore = (LINE_SCORES[Math.min(cleared, 4)] || 0) * level;
    label = (['', '', 'DOBLE', 'TRIPLE', 'TETRIS'])[Math.min(cleared, 4)] || 'TETRIS';
    labelColor = cleared >= 4 ? '#ffd54f' : '#81c784';
  }

  if (b2b) {
    baseScore = Math.floor(baseScore * 1.5);
    label = 'B2B ' + label;
    labelColor = '#ff5722';
  }

  if (!fromPower && combo > 1) baseScore = Math.floor(baseScore * comboMult);

  if (perfectClear) {
    const pcBonuses = [0, 800, 1200, 1800, 2000];
    baseScore += (pcBonuses[Math.min(cleared, 4)] || 2000) * level;
    label = 'PERFECT CLEAR!';
    labelColor = '#00e5ff';
  }

  score += baseScore;
  lastWasDifficult = isDifficult;

  if (cleared >= 4) {
    pendingMono = true;
    addFloatText('TETRIS!', '#ffd54f', 'bold 28px monospace', canvas.height * 0.28);
  }
  if (label && (tspin || cleared >= 4 || b2b || perfectClear)) {
    addFloatText(label, labelColor, 'bold 15px monospace', canvas.height * 0.42);
  }
  if (!fromPower && combo > 1) {
    addFloatText(`×${comboMult} COMBO`, '#ffd700', 'bold 20px monospace', canvas.height * 0.56);
  }

  playLineSound(cleared, tspin, b2b, perfectClear, fromPower ? 0 : combo);
  updateHUD();
  return cleared;
}

function detectTSpin() {
  const corners = [
    [current.y,     current.x    ],
    [current.y,     current.x + 2],
    [current.y + 2, current.x    ],
    [current.y + 2, current.x + 2],
  ];
  let occupied = 0;
  for (const [r, c] of corners) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c]) occupied++;
  }
  if (occupied >= 3) return 'tspin';
  if (occupied === 2) return 'mini';
  return null;
}

function addFloatText(text, color, font, y) {
  floatTexts.push({ text, color, font, y, startTime: performance.now() });
}

function drawFloatTexts() {
  const now = performance.now();
  const duration = 1600;
  floatTexts = floatTexts.filter(ft => now - ft.startTime < duration);
  for (const ft of floatTexts) {
    const t = (now - ft.startTime) / duration;
    const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
    const yOff = -50 * t;
    ctx.globalAlpha = alpha;
    ctx.font = ft.font;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, canvas.width / 2, ft.y + yOff);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function getAudioCtx() {
  if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  return audioCtx;
}

function playTone(freq, dur, type = 'square', vol = 0.12) {
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + dur);
  } catch(e) {}
}

function playLineSound(cleared, tspin, b2b, perfectClear, comboN) {
  if (perfectClear) {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.18), i * 70));
    return;
  }
  if (cleared >= 4) {
    [261, 330, 392, 523].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.15), i * 35));
    if (b2b) setTimeout(() => playTone(1046, 0.4, 'sine', 0.18), 140);
    return;
  }
  if (tspin) {
    playTone(440, 0.1, 'square', 0.14);
    setTimeout(() => playTone(660, 0.18, 'sine', 0.15), 90);
    return;
  }
  const baseFreqs = [0, 220, 277, 330, 392];
  const freq = baseFreqs[Math.min(cleared, 4)] * (b2b ? 1.5 : 1);
  if (comboN > 4) {
    playTone(freq, 0.1, 'square', 0.12);
    setTimeout(() => playTone(freq * 1.25, 0.15, 'sine', 0.14), 80);
  } else {
    playTone(freq, 0.18, 'sine', 0.12);
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
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.isPower) {
    triggerPower();
    spawn();
  } else {
    const tspin = current.type === 3 && lastWasRotate ? detectTSpin() : null;
    lastWasRotate = false;
    merge();
    clearLines(tspin);
    spawn();
  }
}

function spawn() {
  current = next;
  next = nextPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

// ---- Power-ups ----

function triggerPower() {
  const { type, x: cx, y: cy } = current;
  flashPower(type);
  switch (type) {
    case POWERS.BOMB:      effectBomba(cx, cy);  break;
    case POWERS.LIGHTNING: effectRayo(cx, cy);   break;
    case POWERS.TINT:      effectTinte();         break;
    case POWERS.GRAVITY:   effectGravedad();      break;
    case POWERS.FREEZE:    effectCongelar();      break;
  }
  purgeStaleHoles();
  clearLines(null, true);
  updateHUD();
}

function effectBomba(cx, cy) {
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS)
        board[r][c] = 0;
}

function effectRayo(cx, cy) {
  for (let c = 0; c < COLS; c++) board[cy][c] = 0;
  for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
}

function effectTinte() {
  const counts = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v >= 1 && v <= 7) counts[v] = (counts[v] || 0) + 1;
    }
  const keys = Object.keys(counts).map(Number);
  if (!keys.length) return;
  const target = keys.reduce((a, b) => counts[a] > counts[b] ? a : b);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILDCARD;
}

function effectGravedad() {
  for (let c = 0; c < COLS; c++) {
    const filled = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r][c] !== 0) filled.push(board[r][c]);
    for (let r = 0; r < ROWS; r++)
      board[r][c] = r < ROWS - filled.length ? 0 : filled[r - (ROWS - filled.length)];
  }
  purgeStaleHoles();
}

function effectCongelar() {
  frozenUntil = performance.now() + 5000;
}

function flashPower(type) {
  powerAnim = { text: `${POWER_SYMBOLS[type]} ${POWER_NAMES[type]}`, color: COLORS[type], startTime: performance.now() };
}

// ---- HUD ----

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Drawing ----

function drawNutHole(context, bx, by, size, alpha) {
  const cx = bx * size + size / 2;
  const cy = by * size + size / 2;
  context.globalAlpha = alpha ?? 1;
  context.beginPath();
  context.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
  context.strokeStyle = COLORS[8];
  context.lineWidth = 2;
  context.stroke();
  context.globalAlpha = 1;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

  if (colorIndex === WILDCARD) {
    // 8-pointed star to mark wildcards
    const cx = x * size + size / 2;
    const cy = y * size + size / 2;
    const s = size * 0.22;
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.beginPath();
    context.moveTo(cx,       cy - s * 1.5);
    context.lineTo(cx + s * 0.6, cy - s * 0.6);
    context.lineTo(cx + s * 1.5, cy);
    context.lineTo(cx + s * 0.6, cy + s * 0.6);
    context.lineTo(cx,       cy + s * 1.5);
    context.lineTo(cx - s * 0.6, cy + s * 0.6);
    context.lineTo(cx - s * 1.5, cy);
    context.lineTo(cx - s * 0.6, cy - s * 0.6);
    context.closePath();
    context.fill();
  } else if (colorIndex >= POWERS.BOMB && colorIndex <= POWERS.FREEZE) {
    context.font = `${Math.floor(size * 0.55)}px serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWER_SYMBOLS[colorIndex], x * size + size / 2, y * size + size / 2);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
  } else {
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid').trim();
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
  for (const key of boardHoles) {
    const [r, c] = key.split(',').map(Number);
    drawNutHole(ctx, c, r, BLOCK);
  }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === 8) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === 8) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);

  const now = performance.now();

  // Freeze overlay
  if (frozenUntil && now < frozenUntil) {
    const secs = Math.ceil((frozenUntil - now) / 1000);
    ctx.fillStyle = 'rgba(100, 200, 255, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#b3e5fc';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`❄ ${secs}s`, canvas.width / 2, 18);
    ctx.textAlign = 'left';
  }

  // Power flash label
  if (powerAnim) {
    const elapsed = now - powerAnim.startTime;
    const duration = 1800;
    const t = elapsed / duration;
    const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(powerAnim.text, canvas.width / 2, canvas.height / 2);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    } else {
      powerAnim = null;
    }
  }

  // Floating score texts
  drawFloatTexts();

  // Persistent combo indicator
  if (combo > 1) {
    const mult = Math.min(combo, 8);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'left';
    ctx.fillText(`COMBO ×${mult}`, 4, 14);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (next.isPower) {
    const size = 52;
    const px = (nextCanvas.width  - size) / 2;
    const py = (nextCanvas.height - size) / 2 - 10;
    nextCtx.fillStyle = COLORS[next.type];
    nextCtx.fillRect(px, py, size, size);
    nextCtx.fillStyle = 'rgba(255,255,255,0.15)';
    nextCtx.fillRect(px, py, size, 6);
    nextCtx.font = `${Math.floor(size * 0.58)}px serif`;
    nextCtx.textAlign = 'center';
    nextCtx.textBaseline = 'middle';
    nextCtx.fillText(POWER_SYMBOLS[next.type], nextCanvas.width / 2, py + size / 2);
    nextCtx.textBaseline = 'alphabetic';
    nextCtx.fillStyle = COLORS[next.type];
    nextCtx.font = 'bold 10px monospace';
    nextCtx.fillText(POWER_NAMES[next.type], nextCanvas.width / 2, nextCanvas.height - 4);
    nextCtx.textAlign = 'left';
    return;
  }

  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === 8) drawNutHole(nextCtx, offX + 1, offY + 1, NB);

  const SPECIAL_LABELS = {
    [MONO]: '🎁 1x1',
    [CHALLENGE]: '⚠ RETO',
    15: '✦ PLUS',
    16: '⌣ U',
    17: 'Y',
  };
  if (SPECIAL_LABELS[next.type]) {
    nextCtx.fillStyle = COLORS[next.type];
    nextCtx.font = 'bold 9px monospace';
    nextCtx.textAlign = 'center';
    nextCtx.fillText(SPECIAL_LABELS[next.type], nextCanvas.width / 2, nextCanvas.height - 3);
    nextCtx.textAlign = 'left';
  }
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
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = frozenUntil > 0 && ts < frozenUntil;
  if (!frozen) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  } else {
    dropAccum = 0;
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  boardHoles = new Set();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  pendingPower = false;
  pendingMono = false;
  frozenUntil = 0;
  powerAnim = null;
  combo = 0;
  lastWasDifficult = false;
  lastWasRotate = false;
  floatTexts = [];
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  getAudioCtx(); // init on first user gesture
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastWasRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastWasRotate = false; }
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

const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');

function setTheme(light) {
  document.body.classList.toggle('light', light);
  themeToggle.setAttribute('aria-checked', String(light));
  themeLabel.textContent = light ? 'CLARO' : 'OSCURO';
  draw();
}

themeToggle.addEventListener('click', () => {
  setTheme(!document.body.classList.contains('light'));
  themeToggle.blur();
});

init();
