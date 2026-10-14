# Requerimientos nuevos — Tetris

---

## REQ-01: Rotación antihoraria (CCW) con tecla Z

**Descripción**
Añadir rotación en sentido antihorario usando la tecla `Z`, conforme al estándar Tetris Guideline. Actualmente solo existe rotación CW (`↑` / `X`).

**Comportamiento esperado**
- `Z` invoca `rotateCCW()` con los mismos wall-kicks que `tryRotate()` (`[0, -1, 1, -2, 2]`).
- En modo `mirror` nivel ≥ 5, `Z` rota CW (inverso del inverso) y `↑`/`X` rota CCW, manteniendo coherencia.
- Actualizar lista de controles en el overlay de pausa y el panel lateral.

**Archivos afectados**
- `game.js` — añadir `case 'KeyZ'` en el keydown listener llamando a una nueva función `tryRotateCCW()`.
- `index.html` — agregar `<li><kbd>Z</kbd> rotar ↺</li>` en ambas listas de controles.

**Criterios de aceptación**
1. Pulsar `Z` durante el juego rota la pieza activa en sentido antihorario.
2. Wall-kicks funcionan igual que en CW.
3. La interacción con el modo `mirror` es coherente (las direcciones se invierten).
4. `lastWasRotate = true` se establece correctamente para detección de T-spin.

---

## REQ-02: Soporte táctil para móviles

**Descripción**
El juego es actualmente inutilizable en pantallas táctiles. Añadir gestos con un solo dedo sobre el canvas `#board`.

**Comportamiento esperado**

| Gesto | Acción |
|---|---|
| Swipe izquierda | Mover pieza a la izquierda |
| Swipe derecha | Mover pieza a la derecha |
| Swipe abajo rápido | Hard drop |
| Swipe abajo lento / tap-hold | Soft drop continuo |
| Tap (sin movimiento) | Rotar CW |

Umbrales sugeridos: swipe reconocido si el desplazamiento supera 20 px; swipe abajo "rápido" si `dy > 60 px` o velocidad `> 0.8 px/ms`.

**Archivos afectados**
- `game.js` — listeners `touchstart`, `touchmove`, `touchend` sobre `canvas`. Calcular delta desde `touchstart`. No propagar eventos que interfieran con el scroll del navegador (`e.preventDefault()`).
- `style.css` — `touch-action: none` en `#board` para evitar scroll accidental.
- `index.html` — sin cambios.

**Criterios de aceptación**
1. En móvil, la pieza se mueve / rota / cae correctamente mediante gestos.
2. No hay scroll de página al interactuar con el canvas.
3. La lógica de teclado existente no se ve afectada.
4. Funciona simultáneamente con el skin y modos de desafío actuales.

---

## REQ-03: Estadísticas detalladas al fin de partida

**Descripción**
La pantalla de Game Over y la de victoria de desafío solo muestran puntuación. Añadir un resumen de estadísticas de la partida.

**Datos a mostrar**
- Tiempo jugado (formato `m:ss`).
- Total de piezas colocadas.
- Distribución de limpiezas: single / doble / triple / Tetris (contadores independientes).
- Número de T-spins totales.
- Líneas por minuto (LPM) como medida de eficiencia.
- Combo máximo alcanzado (ya existe `maxCombo`, solo hay que mostrarlo).

**Implementación**
- Añadir contadores en `init()`: `piecesPlaced`, `clearCounts = [0,0,0,0,0]`, `tspinsTotal`, `startTimestamp`.
- Incrementar en `lockPiece()` y `clearLines()` según corresponda.
- `startTimestamp = performance.now()` en `init()`; diferencia en `endGame()` / `winChallenge()` / `loseChallenge()` para calcular tiempo y LPM.
- Inyectar tabla HTML de stats en `.overlay-box` antes del botón Reiniciar.

**Archivos afectados**
- `game.js` — nuevas variables de estado + lógica de cálculo + render de stats.
- `style.css` — estilos para `.stats-table` (similar a `.scores-tbl`, compacto, monoespacio).
- `index.html` — sin cambios estructurales.

**Criterios de aceptación**
1. Las stats aparecen en la pantalla de fin de partida (Game Over, victoria y derrota en desafíos).
2. LPM es `lines / (ms_elapsed / 60000)`, redondeado a 1 decimal.
3. Si el tiempo jugado es 0 (partida inmediata) no se divide entre cero.
4. Las stats no se persisten en localStorage (son efímeras, solo de la partida actual).
