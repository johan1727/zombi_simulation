import * as THREE from 'three';
import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { buildCityView } from '../render/cityView';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
buildCityView(scene, world.city);

// Cámara provisional (Task 8 la reemplaza por CameraRig).
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1500
);
camera.position.set(world.city.width / 2 - 60, 70, world.city.depth / 2 + 60);
camera.lookAt(world.city.width / 2, 0, world.city.depth / 2);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
