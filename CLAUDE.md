# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla-JavaScript Tetris rendered with the HTML5 Canvas 2D API. Three static
files (`index.html`, `style.css`, `game.js`), no dependencies, no build step, no
tests, no linter, no `package.json`.

## Running

Open `index.html` directly, or serve the folder statically for a cleaner reload
story:

```powershell
python -m http.server 8000   # then open http://localhost:8000
npx serve .
```

There is nothing to build, compile, or install. Changes take effect on browser
reload.

## Architecture

All game logic lives in `game.js` as a single top-level script under
`'use strict'`. There are no modules, classes, or imports.

- **State is module-level `let` variables** (`board`, `current`, `next`, `score`,
  `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...). `init()` resets
  every one of them and is the single entry point — it runs on load and on
  Restart.
- **Piece cell value doubles as the color index.** A shape matrix stores `0` for
  empty or `1..8` for filled; that same integer indexes `COLORS` and is written
  straight into `board` on merge. `rotateCW` preserves the values, so rotation,
  collision, merge, and rendering all key off one number. Type `8` is the "nut"
  (tuerca) challenge piece: a 3x3 ring with a `0` hole in the centre, so its
  empty middle cell blocks line clears until another piece fills it from above.
- **`board`** is a `ROWS x COLS` array of those integers. `clearLines` mutates it
  in place with `splice` + `unshift` (drop a full row, prepend an empty one).
- **Game loop** (`loop`) is a `requestAnimationFrame` callback that accumulates
  `dt` into `dropAccum` and steps the piece down one row when it exceeds
  `dropInterval`. `draw()` fully clears and repaints the canvas every frame —
  grid, settled board, ghost, then current piece. No dirty-rect optimization.
- **Rotation with wall kicks**: `tryRotate` rotates, then tries horizontal
  offsets `[0, -1, 1, -2, 2]` and keeps the first that doesn't `collide`.
- **Lock / spawn cycle**: `lockPiece` -> `merge` -> (`applyPowerUp` if
  `current.power`) -> `clearLines` -> `spawn`. `spawn` promotes `next` to
  `current`, rolls a new `next` via `nextPiece()`, and if the new piece already
  collides it calls `endGame()` (that is the only game-over check).
- **Power-ups**: every `POWER_EVERY` (5) cleared lines, `clearLines` sets
  `powerPending`; the next `nextPiece()` returns a 1x1 block (`type: 9`,
  `shape: [[9]]`, `power: <kind>`) from `makePowerUp()` instead of `randomPiece()`
  — it is NOT in `PIECES`, so the normal 1..8 bag is untouched. On lock,
  `applyPowerUp` clears the origin cell then runs one of `pwBomb` / `pwRay` /
  `pwDye` / `pwGravity` / sets `freezeUntil`. `freeze` suspends auto-fall in
  `loop` for `FREEZE_MS`; `togglePause` preserves the remaining freeze via
  `freezeRemaining`. Glyphs (`POWERUP_GLYPH`) are drawn by `drawGlyph` over the
  falling piece and the NEXT preview only (value 9 never stays on `board`).
- **Combos y multiplicadores**: `resolveClears(tSpin)` (llamado desde
  `lockPiece`, sustituye al viejo `clearLines`) hace `clearFullRows()` y luego
  puntúa. `comboCount` arranca en `-1`, sube en cada lock que limpia >=1 línea y
  vuelve a `-1` en un lock sin líneas; el multiplicador es `comboCount + 1` a
  partir del 2º clear encadenado (x2, x3...). `detectTSpin()` marca T-spin si la
  última acción fue rotar (`lastRotation`, que se pone a `false` en cualquier
  traslación/gravedad/spawn y a `true` en `tryRotate`), la pieza es la T (tipo 3)
  y >=3 de sus 4 esquinas diagonales están bloqueadas. Un clear es "difícil"
  (Tetris o T-spin con línea) y aplica B2B (`b2bActive`, x1.5) si el anterior
  difícil sigue la cadena; un lock sin líneas NO rompe B2B, un clear normal sí.
  Perfect Clear (`boardEmpty()` tras limpiar) suma `PERFECT_SCORES[cleared]`.
  Fórmula: `round(base * level * comboMult) (+ perfect)`. Efectos: `announceClears`
  encola textos flotantes en `effects[]` (render `drawEffects`), dispara
  `flashUntil` (render `drawFlash`) y `playSound` (Web Audio, sin assets;
  interruptor SONIDO en el panel, persistido en `localStorage` `tetris-sound`).
- **Modo desafío** (`CHALLENGES`, selector `#challenge-select` en el panel):
  `init()` lee `challengeSelect.value`, resuelve el objeto de `CHALLENGE_BY_ID`
  (`'classic'` => `challenge = null`) y guarda la elección en `localStorage`
  (`tetris-challenge`). Cada desafío es un conjunto de flags que el motor
  interpreta genéricamente, sin lógica por-id dispersa: `goalLines`,
  `timeLimitMs`, `surviveMs`, `garbageEveryMs`, `setup()`, `hideSettled`,
  `reverseRotAtLevel`, `level`/`dropInterval` iniciales. `challengeStatus`
  (`'none'|'playing'|'won'|'lost'`), `challengeTime` y `garbageAccum` se acumulan
  en `loop` sólo si `!frozen`. `checkChallenge()` (llamado desde `loop` y al final
  de `resolveClears`) evalúa victoria/derrota y llama `endChallenge(won, reason)`,
  que reusa el overlay. `endGame()` en modo desafío redirige a
  `endChallenge(false, 'Tablero lleno')`. `lockPiece` corta antes de `spawn()` si
  el desafío terminó. Modificadores de reglas: `addGarbageRow()` (empuja el campo
  y sube la pieza), `setupPreset()` rellena 9 filas dentadas, `tryRotate` usa
  `rotateCCW` si `level >= reverseRotAtLevel`, y `draw()` omite pila + ghost
  cuando `hideSettled` y ya pasó `revealUntil` (ventana de 500 ms tras cada lock).
- **Pause** (`togglePause`) cancels the RAF, shows the overlay, and on resume
  reseeds `lastTime` before restarting `loop` so no huge `dt` is accumulated.
- HUD (`updateHUD`) is refreshed ad hoc from several call sites (keydown handler,
  `softDrop`, `clearLines`); keep that in mind when adding scoring paths.

## Constants and coupled values

Tuning constants are at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`,
`PIECES`, `LINE_SCORES`, plus `dropInterval` (initial fall speed, ms) set in
`init()`. Level/speed curve: `dropInterval = max(100, 1000 - (level-1)*90)`,
level rises every 10 lines.

If you change `COLS`, `ROWS`, or `BLOCK`, you must also update the hardcoded
`width`/`height` on `<canvas id="board">` in `index.html` — they must equal
`COLS*BLOCK` x `ROWS*BLOCK` (currently 300 x 600). The `NEXT` preview canvas is a
fixed 120 x 120 (4 cells at 30px); `drawNext` centers pieces in that 4x4 area.
