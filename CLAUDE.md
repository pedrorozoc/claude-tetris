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
  empty or `1..7` for filled; that same integer indexes `COLORS` and is written
  straight into `board` on merge. `rotateCW` preserves the values, so rotation,
  collision, merge, and rendering all key off one number.
- **`board`** is a `ROWS x COLS` array of those integers. `clearLines` mutates it
  in place with `splice` + `unshift` (drop a full row, prepend an empty one).
- **Game loop** (`loop`) is a `requestAnimationFrame` callback that accumulates
  `dt` into `dropAccum` and steps the piece down one row when it exceeds
  `dropInterval`. `draw()` fully clears and repaints the canvas every frame —
  grid, settled board, ghost, then current piece. No dirty-rect optimization.
- **Rotation with wall kicks**: `tryRotate` rotates, then tries horizontal
  offsets `[0, -1, 1, -2, 2]` and keeps the first that doesn't `collide`.
- **Lock / spawn cycle**: `lockPiece` -> `merge` -> `clearLines` -> `spawn`.
  `spawn` promotes `next` to `current`, rolls a new `next`, and if the new piece
  already collides it calls `endGame()` (that is the only game-over check).
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
