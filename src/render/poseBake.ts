import * as THREE from 'three';

/**
 * Hornea la pose ACTUAL de un THREE.SkinnedMesh (tras posicionar su
 * AnimationMixer/Skeleton donde se quiera) en una BufferGeometry plana,
 * aplicando skinning lineal por vértice (misma fórmula que el vertex
 * shader estándar de Three.js para SkinnedMesh, hecha una vez en CPU).
 *
 * Se llama UNA sola vez al cargar (no por frame): el resultado es una
 * geometría sin huesos, apta para THREE.InstancedMesh (que no soporta
 * skinning por instancia — cada instancia comparte una sola `geometry`).
 * Para hornear el bind pose (pose neutra/reposo, la más simple y segura
 * para un primer entregable), basta con NO tocar la skeleton tras cargar
 * el GLB: `skeleton.boneMatrices` en su estado inicial ya es la bind pose.
 */
export function hornearPose(skinned: THREE.SkinnedMesh): THREE.BufferGeometry {
  skinned.skeleton.update();
  const geoOrig = skinned.geometry;
  const pos = geoOrig.attributes.position;
  const skinIndex = geoOrig.attributes.skinIndex;
  const skinWeight = geoOrig.attributes.skinWeight;
  const boneMatrices = skinned.skeleton.boneMatrices; // Float32Array, 16 por hueso

  const salida = new Float32Array(pos.count * 3);
  const vTmp = new THREE.Vector3();
  const vAcum = new THREE.Vector3();
  const m = new THREE.Matrix4();

  for (let i = 0; i < pos.count; i++) {
    vAcum.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const peso = skinWeight.getComponent(i, j);
      if (peso === 0) continue;
      const huesoIdx = skinIndex.getComponent(i, j);
      m.fromArray(boneMatrices, huesoIdx * 16);
      vTmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
      vAcum.addScaledVector(vTmp, peso);
    }
    salida[i * 3] = vAcum.x;
    salida[i * 3 + 1] = vAcum.y;
    salida[i * 3 + 2] = vAcum.z;
  }

  const geoHorneada = new THREE.BufferGeometry();
  geoHorneada.setAttribute('position', new THREE.BufferAttribute(salida, 3));
  if (geoOrig.attributes.uv) geoHorneada.setAttribute('uv', geoOrig.attributes.uv.clone());
  // GLTFLoader activa material.vertexColors=true en cuanto el primitive trae
  // COLOR_0 (caso de survivor-base.glb) — si la geometría horneada no trae
  // el atributo 'color' que ese material espera, WebGL falla en silencio al
  // dibujar (nada de error en consola, la malla simplemente no aparece:
  // hallazgo de verificación en navegador, Plan 6 Task 3).
  if (geoOrig.attributes.color) geoHorneada.setAttribute('color', geoOrig.attributes.color.clone());
  if (geoOrig.index) geoHorneada.setIndex(geoOrig.index.clone());
  geoHorneada.computeVertexNormals();
  return geoHorneada;
}
