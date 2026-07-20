import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { CityView } from '../render/cityView';
import { cargarModelosFondo } from '../render/buildingModels';
import { cargarModelosAutos, CarsView } from '../render/carsView';
import { JugablesView } from '../render/jugablesView';
import { cargarPersonajes, PersonajesView } from '../render/personajesView';
import { PersonajesAltaView } from '../render/personajesAltaView';
import { SplatsView } from '../render/splatsView';
import { CameraRig } from '../render/cameraRig';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';
import { Controles } from './controles';
import { PanelAgentes } from '../ui/panelAgentes';
import { Minimapa } from '../ui/minimapa';
import { Posesion } from './posesion';
import { Partida } from './partida';
import { Rival, INTERVALO_MUESTRA, calcularMuestraPropia, type RivalComparable } from './rival';
import type { ConexionSala } from '../net/sala';
import { RivalEnVivo } from '../net/rivalEnVivo';
import { mostrarPantallaSala } from '../ui/sala';
import { Resultado } from '../ui/resultado';
import { Audio } from '../ui/audio';
import { Tutorial } from '../ui/tutorial';
import { Barks } from '../ui/barks';
import { decodificarDesafio } from './desafio';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const avisoDesconexionEl = document.getElementById('aviso-desconexion');

/**
 * Desafío (Task 7): `?reto=<codigo>` trae una partida ajena ya terminada
 * (semilla + curva + índice). `decodificarDesafio` nunca lanza — un link
 * pegado a medias o corrupto simplemente cae a `null` y el juego arranca
 * como una partida normal (con `?seed=` si lo hay, o semilla aleatoria).
 */
const params = new URLSearchParams(location.search);
const reto = params.get('reto') ? decodificarDesafio(params.get('reto')!) : null;

/**
 * Punto de entrada (Plan 10 Task 3): un `?reto=` válido en la URL es un modo
 * aparte (desafío asíncrono, Plan 4 Task 7) — jugar EXACTAMENTE la pandemia
 * de un link ajeno no tiene nada que ver con matchmaking en vivo, así que
 * SALTA la pantalla de sala por completo y arranca igual que siempre.
 *
 * Sin `?reto=`, `mostrarPantallaSala()` (src/ui/sala.ts) bloquea hasta que
 * el jugador elige: "jugar solo" (sin red — mismo flujo de siempre, `?seed=`
 * de la URL o una aleatoria) o crear/unirse a una sala en vivo (la seed la
 * reparte el relay al emparejar, `eleccion.seed`/`eleccion.conexion`).
 */
async function elegirInicio(): Promise<{ seed: string; conexion?: ConexionSala }> {
  if (reto) return { seed: reto.seed };
  const eleccion = await mostrarPantallaSala();
  if (eleccion.conexion && eleccion.seed) {
    return { seed: eleccion.seed, conexion: eleccion.conexion };
  }
  return { seed: params.get('seed') ?? Math.random().toString(36).slice(2, 8) };
}

/**
 * Arranque asíncrono (Plan 6): `cargarModelosFondo()`/`cargarModelosAutos()`
 * traen los GLB reales de edificios de fondo y autos decorativos, y
 * `cargarPersonajes()` (Task 3) trae `survivor-base.glb` + sus texturas de
 * piel y hornea su geometría UNA vez (fetch bajo el capó vía GLTFLoader) —
 * hay que esperar las tres ANTES de construir `CityView`/`CarsView`/
 * `PersonajesView`, que ya no levantan geometría síncrona. Las tres cargas
 * son independientes entre sí, así que van en paralelo con `Promise.all`. El
 * resto de la construcción de la escena sigue siendo síncrona; el HUD ya
 * muestra "Cargando…" (`index.html`) hasta el primer `frame`, así que no
 * hace falta una pantalla de carga aparte para este await.
 *
 * `conexionInicial` (Plan 10 Task 3): viene de `elegirInicio()` YA
 * conectada y emparejada (o `undefined` en "jugar solo"/`?reto=`) — aquí
 * solo decide qué tipo de rival construir, nunca abre la conexión.
 */
async function iniciar(seed: string, conexionInicial: ConexionSala | undefined): Promise<void> {
  const world = new World(seed);
  const { renderer, scene } = createScene(canvas);
  const [modelosFondo, modelosAutos, personajesAssets] = await Promise.all([
    cargarModelosFondo(),
    cargarModelosAutos(),
    cargarPersonajes(),
  ]);
  const cityView = new CityView(scene, world.city, modelosFondo);
  // CarsView solo planta autos decorativos en el constructor (sin update());
  // no hace falta guardar la instancia.
  new CarsView(scene, world.city, modelosAutos);
  const jugablesView = new JugablesView(scene, world.city);
  const personajesView = new PersonajesView(scene, world.citizens.length, personajesAssets);
  // Nivel "Alta" (Plan 11 Task 2): reusa los mismos assets crudos/materiales por piel
  // que ya cargó/construyó cargarPersonajes(), sin volver a pedir los .glb por red.
  const personajesAltaView = new PersonajesAltaView(scene, personajesAssets.crudos, personajesAssets.materiales);
  const splatsView = new SplatsView(scene);
  const rig = new CameraRig(canvas, { w: world.city.width, d: world.city.depth });
  const audio = new Audio();
  const hud = new Hud(seed, reto ?? undefined, () => audio.alternar());
  const posesion = new Posesion(canvas, rig, world);
  const controles = new Controles(canvas, rig.camera, world, {
    onPoseer: (idx) => {
      controles.seleccionar(idx);
      posesion.activar(idx);
    },
    onEscapePosesion: () => posesion.desactivar(),
    estaPoseido: () => posesion.activo,
  });
  const panelAgentes = new PanelAgentes(world, controles);
  const minimapa = new Minimapa(world);
  const partida = new Partida();
  /**
   * El rival (Plan 10 Task 3, tres modos posibles):
   * - `conexionInicial` presente: `RivalEnVivo` — el jugador creó/se unió a
   *   una sala y ya se emparejó; sus muestras llegan por WebSocket.
   * - `reto` presente (sin `conexionInicial`, son mutuamente excluyentes —
   *   `elegirInicio()` nunca muestra la pantalla de sala si hay `?reto=`):
   *   `Rival` estático, curva congelada del desafío.
   * - Ninguno de los dos: `Rival` fantasma de siempre (misma semilla,
   *   tickeado 1:1 junto al mundo del jugador, sin órdenes).
   * Tipado como `RivalComparable` (no la clase concreta) para que los tres
   * modos sean intercambiables sin fricción — ver `rival.ts`.
   */
  const rival: RivalComparable = conexionInicial
    ? new RivalEnVivo(conexionInicial)
    : new Rival(seed, undefined, reto ?? undefined);
  const resultado = new Resultado(world, partida, rival);
  const tutorial = new Tutorial();
  const barks = new Barks(scene, rig.camera);

  /**
   * Matchmaking en vivo (Plan 10 Task 3): con `conexionInicial` (sala ya
   * emparejada), `enviarMuestraPropia()` manda la muestra propia al rival
   * remoto cada `INTERVALO_MUESTRA`. Sin ella (jugar solo o `?reto=`), sigue
   * siendo no-op — CERO cambio de comportamiento respecto a antes de esta task.
   */
  const conexionSalaActiva: ConexionSala | undefined = conexionInicial;
  let brechasPropiasPrevias = 0;

  if (conexionSalaActiva) {
    // El rival remoto se desconectó a mitad de partida: seguimos jugando
    // nuestra propia ciudad (100% local y determinista, como siempre);
    // `RivalEnVivo` simplemente deja de recibir muestras nuevas y conserva
    // el último valor conocido. Solo avisamos, sin bloquear nada.
    conexionSalaActiva.onDesconexion(() => {
      avisoDesconexionEl?.classList.add('activo');
    });
  }

  /**
   * Igual cálculo que el modo fantasma de `Rival` (`calcularMuestraPropia`,
   * src/game/rival.ts) y misma cadencia (`INTERVALO_MUESTRA`, 5 s a 30 tps),
   * pero sobre el `world` del JUGADOR (no el rival) — la muestra que se
   * envía por red para que el otro lado la vea como su "rival en vivo".
   */
  const enviarMuestraPropia = (): void => {
    if (!conexionSalaActiva) return;
    if (world.tickCount % INTERVALO_MUESTRA !== 0) return;
    const m = calcularMuestraPropia(world, brechasPropiasPrevias);
    brechasPropiasPrevias = m.brechasActuales;
    conexionSalaActiva.enviarMuestra({
      vivosPct: m.vivosPct,
      indiceCiudad: m.indiceCiudad,
      brecha: m.brecha,
    });
  };

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Tecla M: alterna audio. Botón del HUD hace lo mismo (ver arriba).
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'm' || e.key === 'M') audio.alternar();
  });
  // Primer gesto del usuario (click o tecla, cualquiera): desbloquea el
  // AudioContext aunque el jugador nunca toque el botón/tecla de audio —
  // requisito de autoplay de los navegadores (Task 8). Se dispara una sola vez.
  const desbloquearAudio = (): void => {
    audio.intentarDesbloquear();
    window.removeEventListener('pointerdown', desbloquearAudio);
    window.removeEventListener('keydown', desbloquearAudio);
  };
  window.addEventListener('pointerdown', desbloquearAudio);
  window.addEventListener('keydown', desbloquearAudio);

  // Delta de tiempo REAL entre frames de render (segundos), para el
  // AnimationMixer de PersonajesAltaView (Plan 11 Task 2) — a diferencia del
  // resto del juego, este mixer no tickea con la sim (30 tps fijos) sino con
  // el reloj de pantalla. `performance.now()` es válido fuera de src/sim.
  // Mismo tope que `MAX_ELAPSED` de loop.ts: evita un salto de animación
  // enorme si la pestaña estuvo en segundo plano.
  let ultimoFrameMs = performance.now();

  const frame = (alpha: number): void => {
    const ahoraMs = performance.now();
    const dtSegundos = Math.min((ahoraMs - ultimoFrameMs) / 1000, 0.25);
    ultimoFrameMs = ahoraMs;

    if (posesion.activo) posesion.actualizarCamara(alpha);
    else rig.update();
    controles.update();
    const foco = rig.focusPoint;
    cityView.updateOcclusion(rig.camera.position.x, rig.camera.position.z, foco.x, foco.z);
    jugablesView.update(world, foco.x, foco.z);
    const ocultosPorAlta = personajesAltaView.update(world.citizens, alpha, world.tickCount, dtSegundos, rig.camera);
    personajesView.update(world.citizens, alpha, controles.seleccionado, world.tickCount, ocultosPorAlta);
    splatsView.update(world.splats);
    audio.update(world, partida, rival);
    hud.update(world, partida, rival, audio.habilitado);
    panelAgentes.update(world, controles.seleccionado);
    minimapa.update(foco.x, foco.z);
    resultado.update();
    tutorial.actualizar(world, partida);
    barks.update(world, alpha);
    renderer.render(scene, rig.camera);
  };

  // Gancho de depuración/verificación programática (solo en dev): permite a
  // las herramientas de preview tickear el mundo y renderizar un frame a mano
  // (la pestaña oculta congela requestAnimationFrame — limitación conocida).
  // `tick()` incluye lo que en el bucle real hace `onTick` (posesion.alTick())
  // justo antes de `world.tick()`, más `partida.update()` y `rival.tick()`
  // justo después, para que el WASD emulado en consola funcione Y el
  // reloj/fin de partida/rival avancen igual que en el bucle real.
  if (import.meta.env.DEV) {
    (window as unknown as { pandemia: unknown }).pandemia = {
      world,
      controles,
      posesion,
      rig,
      personajesAltaView,
      personajesView,
      scene,
      partida,
      rival,
      resultado,
      audio,
      tutorial,
      barks,
      seed,
      reto,
      conexionSalaActiva,
      frame,
      tick: () => {
        if (partida.estado === 'terminada') return;
        posesion.alTick();
        world.tick();
        partida.update(world);
        rival.tick();
        enviarMuestraPropia();
      },
    };
  }

  startLoop(
    world,
    frame,
    () => posesion.alTick(),
    () => partida.estado !== 'terminada',
    () => {
      partida.update(world);
      rival.tick();
      enviarMuestraPropia();
    }
  );
}

void (async (): Promise<void> => {
  const { seed, conexion } = await elegirInicio();
  await iniciar(seed, conexion);
})();
