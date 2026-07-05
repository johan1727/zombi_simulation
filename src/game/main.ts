import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { buildCityView } from '../render/cityView';
import { CitizensView } from '../render/citizensView';
import { CameraRig } from '../render/cameraRig';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
buildCityView(scene, world.city);
const citizensView = new CitizensView(scene, world.citizens.length);
const rig = new CameraRig(canvas, { w: world.city.width, d: world.city.depth });
const hud = new Hud(seed);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startLoop(world, (alpha) => {
  citizensView.update(world.citizens, alpha);
  rig.update();
  hud.update(world);
  renderer.render(scene, rig.camera);
});
