# PANDEMIA — Documento de Diseño

**Fecha:** 2026-07-05
**Estado:** Aprobado por secciones en sesión de brainstorming
**Nombre provisional:** PANDEMIA

---

## 1. Concepto

Juego 3D de navegador, vista de director (arriba, con zoom continuo), estilo *Project Zomboid* × *Guerra Mundial Z* con estética de pintura de colores (sin sangre roja).

**En una frase:** dos jugadores reciben la misma pandemia en la misma ciudad (misma semilla); en 5–8 minutos gana quien mantenga más viva su ciudad.

**Pilares:**
1. **Fácil de aprender, difícil de dominar** — se opera con 3 verbos (seleccionar, mover, habilidad); la profundidad está en las decisiones, no en los controles.
2. **Simulación viva** — ciudadanos con personalidad, memoria y vínculos; el drama emerge solo.
3. **Cero excusas** — misma semilla para ambos jugadores: la diferencia es pura habilidad.
4. **Cada partida termina en una invitación** — link de desafío compartible como motor viral.
5. **Estética pintura** — los zombis y las víctimas "revientan" en salpicaduras de colores vivos (estilo Splatoon/Paintbrawl). Apto para todas las edades, seguro para TikTok, visualmente compartible.

## 2. Bucle de partida (5–8 minutos)

| Fase | Tiempo | Qué pasa |
|---|---|---|
| Inicio | 0:00–0:30 | Ciudad tipo Manhattan con ~800–1,000 ciudadanos viviendo. Aparece el paciente cero (posición dada por la semilla, igual para ambos). |
| Escalada | 0:30–4:00 | Contagio exponencial. Pánico, estampidas, refugios. El jugador despliega agentes: barricadas, megáfono, contención. |
| Clímax | 4:00–7:00 | Hordas formadas. Dilemas de sacrificio (¿el hospital o el puente?). |
| Final | — | Termina al agotarse el reloj o si una ciudad colapsa (población viva < 10%). |

**Condición de victoria — Índice de Ciudad:**
- Componente principal: % de población viva.
- Bonus: estructuras clave en pie (hospital, comisaría, escuela).
- Mayor Índice de Ciudad al final gana. Colapso antes del reloj = derrota inmediata.

**Pantalla de resultado:** comparación lado a lado, gráfica de ambas curvas de supervivencia, estadísticas con sabor ("salvaste 312", "sacrificaste 89 con el megáfono"), botón gigante de REVANCHA (misma semilla u otra) y botón de COMPARTIR DESAFÍO.

## 3. La simulación

### 3.1 Ciudadanos (con libre albedrío — la mayoría)

**Estados base:** tranquilo → alerta → pánico → escondido. El pánico se contagia por proximidad (gritos).

**Inteligencia por capas (IA de utilidad + LOD):**
- **Personalidades (6 arquetipos):** líder (calma y organiza), cobarde (huye primero, propaga pánico), valiente (se arma y pelea), protector (no huye sin su familia), egoísta (se encierra, cierra puertas a otros), imprudente (se acerca a mirar).
- **Decisión por utilidad:** cada ciudadano evalúa opciones (huir, esconderse, ayudar, buscar familia, armarse, atrincherarse) ponderadas por personalidad, percepción y memoria.
- **Memoria:** recuerdan zonas de muerte (las evitan) y edificios seguros.
- **Vínculos:** familias/parejas que se buscan si se separan.
- **Combate en grupo:** valientes y líderes pueden reunir ciudadanos cercanos para atacar zombis aislados. 3+ humanos vs 1 zombi = victoria probable; 1 vs 1 = casi suicidio. Ciudadanos con armas conseguidas disparan, pero el ruido atrae más zombis. **Regla de diseño: toda acción tiene pro y contra.**
- **LOD de IA:** IA completa cerca de la acción/cámara; versión ligera (máquina de estados simple) para ciudadanos lejanos y tranquilos. Objetivo: 1,000 agentes a 30 ticks/seg en navegador.

### 3.2 Infección

- Zombi alcanza a ciudadano → infectado.
- **Incubación 10–20 seg:** sigue pareciendo humano (se tambalea). Ventana para detectarlo antes de que se transforme dentro de un refugio (momento *Guerra Mundial Z*). El paramédico puede diagnosticarlo.
- Transformación: salpicadura de pintura de color, el modelo cambia a zombi.

### 3.3 Zombis

- Rápidos (estilo GMZ), atraídos por **ruido** y **movimiento** (gritos, estampidas, sirenas, disparos).
- Forman hordas que se mueven como marea.
- Presionan barricadas: la barricada aguanta según cuántos empujen (tensión de "presa a punto de reventar").

### 3.4 Edificios y mapa (estilo Nueva York)

- **Dos tipos de edificio (presupuesto de rendimiento):**
  - **Rascacielos de fondo:** dan la silueta de Manhattan; NO se entra. Geometría barata (cajas instanciadas).
  - **Edificios jugables (cantidad limitada, ~15–25):** tiendas, apartamentos bajos, hospital, comisaría, escuela. Se entra y se ve el interior con **vista recortada estilo Project Zomboid**: techo y paredes que estorban se desvanecen cuando la cámara mira dentro o hay unidades dentro.
- **Interiores:** planta baja + un piso superior con **escaleras**; azoteas accesibles (refugio de doble filo: seguro pero sin escapatoria).
- Refugio para ciudadanos. Un infectado dentro = bomba de tiempo.
- Estructuras clave dan puntos al Índice y ventajas: comisaría en pie = 1 agente extra.

### 3.5 Determinismo

- PRNG con semilla; misma semilla = misma pandemia exacta (paciente cero, rutinas, todo).
- Paso fijo de simulación: 30 ticks/seg, desacoplado del render.
- Habilita: duelos justos, fantasmas, repeticiones futuras, tests automáticos.

## 4. El jugador

### 4.1 Agentes controlables (sin libre albedrío — uno de cada tipo)

| Agente | Rol | Dilema |
|---|---|---|
| Policía | Arma de fuego; elimina zombis, detiene infectados | El disparo hace ruido → atrae horda |
| Paramédico | Diagnostica infectados en incubación; revive agentes caídos | Debe acercarse al peligro |
| Megáfono (líder civil) | Dirige multitudes a donde el jugador quiera | Salvar… o usar de carnada |
| Obrero | Barricadas y refuerzo de puertas | Recurso limitado, ¿dónde y cuándo? |

- **Mortales y sin reemplazo** (salvo el extra de la comisaría). Perderlos duele el resto de la partida.
- Autodefensa básica: huyen de zombis si no hay orden contraria.

### 4.2 Controles (modo director)

- Clic en agente = seleccionar; clic en mapa = mover; 1–2 botones grandes de habilidad por agente.
- Sin menús anidados ni atajos obligatorios.

### 4.3 Posesión (mecánica avanzada, opcional)

- Doble clic en un agente → cámara baja en tercera persona detrás de él.
- WASD para mover, ratón para apuntar (arma / megáfono). Esc para volver a director.
- Mientras posees a uno, el resto mantiene su última orden (el riesgo de microjugar).
- El novato puede ganar sin usarla; el experto la exprime.

### 4.4 Cámara

- **Perspectiva estilo Project Zomboid:** cámara alta pero cercana, ligeramente inclinada; personajes pequeños en pantalla, escala íntima de calle. NO vista satelital gigante por defecto.
- **Zoom continuo** (rueda): desde vista de distrito hasta nivel de calle (ver transformaciones de cerca).
- Paneo con arrastre / bordes de pantalla.
- Alertas de borde de pantalla ("¡brote en el distrito norte!").

### 4.5 Accesibilidad / primera partida

- La simulación es entretenida incluso sin intervenir; cualquier acción torpe ya mejora algo.
- **Primera partida guiada:** vs fantasma fácil, instrucciones de una línea en el momento justo (sin pantallas de texto). En ~90 segundos el jugador ya jugó.

## 5. Duelo y viralidad

- **Marcador en vivo:** % de población del rival, sus estructuras, mini-gráfica de ambas curvas. Avisos dramáticos ("¡Al rival le cayó el hospital!"). No se ve el mapa del rival.
- **Link de desafío (asíncrono, Fase 1):** "Sobreviví 6:42 con 34%. Misma pandemia, supérame: [link]". El link codifica semilla + curva del retador; quien lo abre juega contra ese fantasma. Sin registro ni descarga.
- **Matchmaking (Fase 2), estilo Clash Royale:** Buscar partida (en vivo), Jugar con amigo (código de sala de 6 letras), y el link asíncrono. Menú principal con esos 3 caminos.

### 5.1 Ciudadanos con nombre e historias (prototipo)

- Cada ciudadano tiene nombre y personalidad visible al hacer zoom.
- La pantalla de resultado narra historias emergentes reales de la simulación: *"María (protectora) volvió 3 veces a la zona roja buscando a su hijo."* Los datos ya existen en la sim; solo se registran los hitos (rescates, reencuentros, sacrificios) y se redactan con plantillas.
- Objetivo: convertir estadísticas en emociones y la pantalla final en captura compartible.

### 5.2 Giros de semilla (prototipo, versión simple)

- A mitad de partida, 1 evento derivado de la semilla, **idéntico en momento y tipo para ambos jugadores**: apagón (zombis más letales, más pánico), lluvia (amortigua ruido) o helicóptero de rescate (anuncia azotea y cuenta regresiva; proteger la ruta es opcional y arriesgado).
- Aprovecharlo o no es habilidad de cada jugador; la simetría se mantiene siempre.

### 5.3 Fase 2 — features de comunidad

- **Desafío diario (efecto Wordle):** una semilla mundial por día, intentos limitados, tabla de líderes diaria.
- **Clip automático ("el momento de la partida"):** el juego detecta el instante más dramático y lo regenera como mini-repetición compartible (gratis gracias al determinismo).
- **Modo espectador:** ver la partida de un amigo en vivo transmitiendo solo sus inputs (kilobytes, gracias al determinismo).

### 5.4 Futuro / ideas en el congelador (sin compromiso)

- Modo 4 jugadores (último en pie), repeticiones descargables, más mapas, personalización.
- Perro rastreador (detecta infectados, ladra; nunca muere), zombis especiales por semilla (Gritón, Tanque), contador moral (salvados vs sacrificados), rangos con copas y arenas (Brooklyn → Queens → Manhattan), colores de pintura desbloqueables.
- **Steam (Fase 3):** empaquetar con Electron/Tauri; el código web se reutiliza al 100%. Logros y tablas vía Steamworks. Registro Steam Direct: 100 USD.

## 6. Arquitectura técnica

**Stack:** Three.js + TypeScript + Vite. 100% navegador en Fase 1 (sin servidor: el desafío asíncrono viaja codificado en el link). Fase 2: backend ligero (matchmaking, salas, marcador en vivo).

**Regla nº 1: simulación y render separados y desconocidos entre sí.**

```
src/
├── sim/        Cerebro: ciudadanos, infección, zombis, agentes, física simple.
│               Determinista, 30 ticks/seg. CERO Three.js. Corre sin pantalla.
├── render/     Cuerpo: Three.js. Cámara, zoom, pintura, edificios, instancing.
├── game/       Pegamento: bucle principal, órdenes, posesión, marcador, fin.
├── ui/         Menús, HUD, botones de habilidad, resultado, tutorial guiado.
└── net/        Fase 2: matchmaking, códigos de sala, marcador en vivo.
```

**Rendimiento:** dibujado instanciado (mil cápsulas en una pasada de GPU) + cuadrícula espacial (cada agente solo percibe vecinos cercanos) + LOD de IA.

**Testing (posible gracias a la separación):**
- Test de determinismo: misma semilla dos veces → estado final idéntico (el test más crítico).
- Tests de balance: ciudad sin intervención colapsa entre minuto 3 y 5; con jugada perfecta sobrevive > X%.
- Tests unitarios de sim (contagio, pánico, utilidad de decisiones) sin navegador.

## 7. Plan de construcción — Fase 1 (prototipo, sin assets finales)

Gráficos placeholder: cajas = edificios, cápsulas = personas, colores = estado (sano/incubando/zombi/agente). Cada paso deja el juego jugable.

1. Ciudad + ciudadanos deambulando (cuadrícula tipo Manhattan, rascacielos de fondo, ~800 cápsulas, cámara PZ con zoom).
2. Infección: paciente cero, contagio, incubación, transformación, hordas, salpicaduras de pintura.
3. Pánico, personalidades, refugio y combate en grupo (comportamiento emergente). Edificios jugables con interiores, escaleras y vista recortada.
4. Los 4 agentes con órdenes y habilidades (modo director completo).
5. Posesión (tercera persona, WASD + ratón).
6. Partida completa: reloj, Índice de Ciudad, giro de semilla, rival fantasma, resultado con historias de ciudadanos, revancha.
7. Link de desafío asíncrono + primera partida guiada.

**Fase 2 (tras validar la diversión):** backend de matchmaking, códigos de sala, marcador en vivo real.
**Fase 3 (futuro):** assets finales con dirección de arte, 4 jugadores, más mapas.

## 8. Reparto de trabajo

- **Fable (esta sesión):** diseño ✅, plan de implementación detallado, y verificación final (errores, determinismo, balance).
- **Sonnet 5:** implementación del código siguiendo el plan.
