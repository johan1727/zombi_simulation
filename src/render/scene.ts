import * as THREE from 'three';

export interface SceneParts {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f14);
  // Rango más cercano que antes (era 250-600, Plan 13): el suelo extendido
  // de CityView necesita perderse en la niebla mucho antes de llegar a su
  // propio borde para que el límite del mapa se sienta como un horizonte
  // neblinoso, no un corte.
  scene.fog = new THREE.Fog(0x0d0f14, 150, 400);

  const ambiente = new THREE.HemisphereLight(0xbfd4ff, 0x2a2d33, 0.9);
  scene.add(ambiente);
  const sol = new THREE.DirectionalLight(0xfff2d9, 1.1);
  sol.position.set(120, 180, 80);
  scene.add(sol);

  return { renderer, scene };
}
