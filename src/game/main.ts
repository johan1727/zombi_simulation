import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { CityView } from '../render/cityView';
import { JugablesView } from '../render/jugablesView';
import { CitizensView } from '../render/citizensView';
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

const canvas = document.getElementById('app') as HTMLCanvasElement;

/**
 * Semilla: sin `?seed=` en la URL, cada carga genera una pandemia NUEVA
 * (estilo Dwarf Fortress). Math.random está permitido aquí (src/game):
 * la semilla es una ENTRADA de la sim; dentro de src/sim sigue prohibido.
 * Para duelos y desafíos, `?seed=lo-que-sea` fija la misma pandemia exacta.
 */
const seed =
  new URLSearchParams(location.search).get('seed') ??
  Math.random().toString(36).slice(2, 8);

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
const cityView = new CityView(scene, world.city);
const jugablesView = new JugablesView(scene, world.city);
const citizensView = new CitizensView(scene, world.citizens.length);
const splatsView = new SplatsView(scene);
const rig = new CameraRig(canvas, { w: world.city.width, d: world.city.depth });
const hud = new Hud(seed);
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
// El rival fantasma: MISMA semilla, sin órdenes, tickeado 1:1 junto al mundo
// del jugador (ver afterTick de startLoop más abajo).
const rival = new Rival(seed);
const resultado = new Resultado(world, partida, rival);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const frame = (alpha: number): void => {
  if (posesion.activo) posesion.actualizarCamara(alpha);
  else rig.update();
  controles.update();
  const foco = rig.focusPoint;
  cityView.updateOcclusion(rig.camera.position.x, rig.camera.position.z, foco.x, foco.z);
  jugablesView.update(world, foco.x, foco.z);
  citizensView.update(world.citizens, alpha, controles.seleccionado);
  splatsView.update(world.splats);
  hud.update(world, partida, rival);
  panelAgentes.update(world, controles.seleccionado);
  resultado.update();
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
