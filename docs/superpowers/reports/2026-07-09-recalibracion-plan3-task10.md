# Recalibración del balance — Plan 3, Task 10 (BLOCKED)

**Fecha:** 2026-07-09 · **Rama:** `fase-3-refugio-sociedad` · **Estado: BLOCKED** — el
gate no se alcanza con las 8 perillas autorizadas; decide el orquestador.

## Gate (`tests/balance.test.ts`, semillas `balance-1` y `balance-2`, 800 ciudadanos)

1. Arranque justo: vivos@90s ≥ 60% (≥480)
2. Devastación: vivos@480s ≤ 47% (≤376)
3. Colapso total < 900s

## Metodología

La de `2026-07-06-balance-brote.md`: arnés temporal `tests/medicion.tmp.test.ts`
(imprime vivos@90 / vivos@480 / t de colapso por semilla), UNA perilla por intento,
dentro de los rangos autorizados por el plan. La condición 1 pasó en TODOS los
intentos (vivos@90 ≈ 99.4–99.5%); la tabla omite esa columna.

## Tabla de intentos

Base = config commiteada (resistencia 110, radioPuerta 4, velocidad 3.8,
radioVision 15, velocidadHuida 2.5, INTERIOR_VISION 12, capacidad 40,
factorCalma 0.5). Desde el intento 1, todos incluyen `resistencia=50` salvo
que se indique otra cosa. Negrita = cumple la condición de esa columna.

| # | Cambio | b1 v@480 | b1 colapso | b2 v@480 | b2 colapso |
|---|--------|----------|------------|----------|------------|
| 0 | base (resistencia 110) | 601 (75.1%) | 720.6s | 656 (82.0%) | NUNCA |
| 1 | resistencia 50 | 510 (63.7%) | 813.4s | 638 (79.8%) | 720.3s |
| 2 | + radioPuerta 6 | 575 | 699s | 733 | NUNCA |
| 3 | + radioVision 25 | 770 | NUNCA | 772 | NUNCA |
| 4 | + INTERIOR_VISION 8 | 588 | 824s | 638 | 768s |
| 5 | + capacidad 20 | 510 | 813s | 638 | 761s |
| 6 | + factorCalma 0.8 | 721 | NUNCA | 724 | NUNCA |
| 7 | + factorCalma 0.3 | 564 | 805.6s | 754 | NUNCA |
| 8 | + INTERIOR_VISION 16 | 543 | 806.0s | 638 | 755.1s |
| 9 | + capacidad 60 | 510 | 809.6s | 638 | 720.3s |
| 10 | + velocidadHuida 3.1 | 645 | 718.5s | 564 | 642.2s |
| 11 | resistencia 80 (sola) | 626 | 763.0s | 561 | 715.8s |
| 12 | resistencia 65 (sola) | 539 | 692.0s | 643 | NUNCA |
| 13 | + radioPuerta 3 | 667 | 838.1s | 631 | 676.1s |
| 14 | + velocidad 3.0 | 532 | 710.1s | 578 | 756.6s |
| 15 | + velocidad 3.4 | **366 (45.8%)** | 687.5s | 597 | 816.4s |
| 16 | + velocidad 3.3 | 485 | 736.7s | **292 (36.5%)** | 538.5s |
| 17 | + velocidad 3.35 | 555 | 749.6s | 669 | 853.0s |
| 18 | + velocidad 3.45 | 552 | 692.1s | 531 | 708.6s |
| 19 | + velocidad 3.5 | 732 | NUNCA | 653 | 809.1s |
| 20 | + velocidad 3.25 | 727 | NUNCA | 600 | 809.2s |

## Hallazgos

- **La condición 2 (devastación ≤47% a 8:00) es la inalcanzable.** La media del
  paisaje con las mecánicas del Plan 3 ronda 70–75% de vivos a 8:00; ninguna
  perilla autorizada mueve esa media más de ~10 puntos. Coincide con la lección
  de Task 10/10c: la tasa de mordida sigue siendo el techo, y no está entre las
  perillas autorizadas.
- **El paisaje es caótico, no de filo de navaja suave**: entre velocidad 3.3 y
  3.35, b2 salta de 292 a 669 vivos. Los dos «pases» de una sola semilla
  (intentos 15 y 16) son colas de una distribución ruidosa, no una región
  estable: elegir una config que pase ambas semillas por lotería sería
  sobreajustar a dos semillas sin balancear el juego real (una tercera semilla
  daría ~75% de vivos).
- **El pánico protege**: debilitar la calma del líder (factorCalma 0.8) o
  acelerar la huida (velocidadHuida 3.1) SUBE los vivos: los pánicos corren a
  refugios. Direcciones «obvias» de más letalidad (más visión del zombi, más
  presión de puerta) empeoraron todas.
- **Mejor candidato dejado en el árbol** (sin commitear): `ASEDIO.resistencia=50`
  + `ZOMBIS.velocidad=3.4`. Pasa `balance-1` completo (366 vivos, colapso
  687.5s); `balance-2` falla solo la condición 2 (597 > 376). `npx tsc --noEmit`
  limpio.

## Opciones para el orquestador

1. Autorizar tocar la mecánica de mordida/contagio (el techo real), fuera del
   alcance de esta task.
2. Relajar el umbral de la condición 2 (p. ej. ≤65% con las mecánicas de
   refugio del Plan 3, que por diseño salvan gente).
3. Aceptar sobreajuste explícito a las dos semillas del gate (no recomendado).

El arnés `tests/medicion.tmp.test.ts` queda en el árbol para re-medir; borrar
al cerrar la task.
