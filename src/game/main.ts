import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { CityView } from '../render/cityView';
import { cargarModelosFondo } from '../render/buildingModels';
import { cargarModelosAutos, CarsView } from '../render/carsView';
import { JugablesView } from '../render/jugablesView';
import { cargarPersonajes, PersonajesView } from '../render/personajesView';
import { SplatsView } from '../render/splatsView';
import { CameraRig } from '../render/cameraRig';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';
import { Controles } from './controles';
import { PanelAgentes } from '../ui/panelAgentes';
import { Posesion } from './posesion';
import { Partida } from './partida';
import { Rival } from './rival';
import { Resultado } from '../ui/resultado';
import { Audio } from '../ui/audio';
import { Tutorial } from '../ui/tutorial';
import { Barks } from '../ui/barks';
import { decodificarDesafio } from './desafio';

const canvas = document.getElementById('app') as HTMLCanvasElement;

/**
 * Desafío (Task 7): `?reto=<codigo>` trae una partida ajena ya terminada
 * (semilla + curva + índice). `decodificarDesafio` nunca lanza — un link
 * pegado a medias o corrupto simplemente cae a `null` y el juego arranca
 * como una partida normal (con `?seed=` si lo hay, o semilla aleatoria).
 */
const params = new URLSearchParams(location.search);
const reto = params.get('reto') ? decodificarDesafio(params.get('reto')!) : null;

/**
 * Semilla: sin `?seed=` en la URL, cada carga genera una pandemia NUEVA
 * (estilo Dwarf Fortress). Math.random está permitido aquí (src/game):
 * la semilla es una ENTRADA de la sim; dentro de src/sim sigue prohibido.
 * Para duelos y desafíos, `?seed=lo-que-sea` fija la misma pandemia exacta.
 * Un `?reto=` válido manda sobre `?seed=`: jugar EXACTAMENTE la pandemia
 * del desafío es el punto.
 */
const seed =
  reto?.seed ??
  params.get('seed') ??
  Math.random().toString(36).slice(2, 8);

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
 */
async function iniciar(): Promise<void> {
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
  const partida = new Partida();
  // El rival: MISMA semilla. Sin `reto`, es el fantasma en vivo de siempre
  // (sin órdenes, tickeado 1:1 junto al mundo del jugador). Con `reto`, es
  // estático: no simula, muestra la curva congelada del desafío (ver rival.ts).
  const rival = new Rival(seed, undefined, reto ?? undefined);
  const resultado = new Resultado(world, partida, rival);
  const tutorial = new Tutorial();
  const barks = new Barks(scene, rig.camera);

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

  const frame = (alpha: number): void => {
    if (posesion.activo) posesion.actualizarCamara(alpha);
    else rig.update();
    controles.update();
    const foco = rig.focusPoint;
    cityView.updateOcclusion(rig.camera.position.x, rig.camera.position.z, foco.x, foco.z);
    jugablesView.update(world, foco.x, foco.z);
    personajesView.update(world.citizens, alpha, controles.seleccionado);
    splatsView.update(world.splats);
    audio.update(world, partida, rival);
    hud.update(world, partida, rival, audio.habilitado);
    panelAgentes.update(world, controles.seleccionado);
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
      partida,
      rival,
      resultado,
      audio,
      tutorial,
      barks,
      seed,
      reto,
      frame,
      tick: () => {
        if (partida.estado === 'terminada') return;
        posesion.alTick();
        world.tick();
        partida.update(world);
        rival.tick();
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
    }
  );
}

void iniciar();
