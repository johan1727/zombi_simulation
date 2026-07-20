import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Nombres de archivo (sin extensión) de los edificios de fondo disponibles. */
export const MODELOS_FONDO = [
  'building-a', 'building-b', 'building-c', 'building-d', 'building-e',
  'building-f', 'building-g', 'building-h', 'building-i', 'building-j',
  'building-k', 'building-l', 'building-m', 'building-n',
] as const;

export const MODELOS_SKYSCRAPER = [
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
  'building-skyscraper-d', 'building-skyscraper-e',
] as const;

/**
 * Selección determinista de modelo por edificio: SOLO depende de `id`
 * (índice fijo en `city.buildings`, ya determinista desde cityGen), nunca de
 * `Math.random`. `alto` decide el pool (rascacielos vs. edificio normal); la
 * llama `cityView.ts` pasa `b.height > UMBRAL_RASCACIELOS` — ver ese archivo
 * para el porqué del valor exacto (los edificios `fondo` de cityGen miden
 * 30-120 m, así que el umbral NO puede ser bajo o todos caerían en el pool
 * de rascacielos).
 */
export function elegirModelo(id: number, alto: boolean): string {
  const pool = alto ? MODELOS_SKYSCRAPER : MODELOS_FONDO;
  return pool[id % pool.length];
}

/** Carga todos los GLB de un pool una sola vez; devuelve la escena por nombre. */
export async function cargarModelosFondo(): Promise<Map<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const nombres: readonly string[] = [...MODELOS_FONDO, ...MODELOS_SKYSCRAPER];
  const entradas = await Promise.all(
    nombres.map(async (n) => {
      const gltf = await loader.loadAsync(`/models/props/edificios/${n}.glb`);
      return [n, gltf.scene] as const;
    })
  );
  return new Map(entradas);
}
