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
  scene.fog = new THREE.Fog(0x0d0f14, 250, 600);

  const ambiente = new THREE.HemisphereLight(0xbfd4ff, 0x2a2d33, 0.9);
  scene.add(ambiente);
  const sol = new THREE.DirectionalLight(0xfff2d9, 1.1);
  sol.position.set(120, 180, 80);
  scene.add(sol);

  return { renderer, scene };
}
