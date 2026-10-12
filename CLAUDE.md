# Tetris — CLAUDE.md

## Stack
Vanilla JS (`'use strict'`), HTML5 Canvas, CSS puro. Sin frameworks, sin build tools, sin dependencias.

## Arquitectura
Un solo módulo (`game.js`). Estado global mutable:
- `board` — matriz 20×10, valores 0 (vacío) o 1-7 (color de pieza)
- `current` / `next` — objetos `{ type, shape, x, y }`
- `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`, `lastTime`

## Constantes clave
| Nombre | Valor | Significado |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | Dimensiones del tablero |
| `BLOCK` | 30 px | Tamaño de celda en canvas |
| `LINE_SCORES` | [0,100,300,500,800] | Puntos base por 1-4 líneas |

`dropInterval` inicia en 1000 ms, baja 90 ms por nivel, mínimo 100 ms.

## Flujo principal
`init()` → `loop(ts)` via `requestAnimationFrame` → `draw()` cada frame.

Caída automática acumulada con `dropAccum`. Al tocar fondo: `lockPiece()` → `merge()` + `clearLines()` + `spawn()`.

## Rotación
`rotateCW()` gira 90° en sentido horario. `tryRotate()` aplica wall-kicks con offsets `[0, -1, 1, -2, 2]`.

## Render
- `draw()` — limpia canvas, `drawGrid()`, board, ghost (alpha 0.2), pieza activa.
- `drawNext()` — canvas 120×120 separado, pieza centrada en grid 4×4.
- `drawBlock()` — rectángulo de color + highlight blanco semitransparente en borde superior.

## Archivos
```
index.html   — layout (canvas #board, canvas #next-canvas, panel lateral, overlay)
game.js      — toda la lógica del juego
style.css    — tema oscuro (#0f0f17), colores TokyoNight-ish
```

## Para correr
Abrir `index.html` en navegador. Sin servidor necesario.

## Convenciones
- No agregar dependencias externas.
- Mantener todo en los 3 archivos existentes.
- Piezas indexadas 1-7 (índice 0 = vacío/null).
