import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hornearPose } from '../src/render/poseBake';

describe('hornearPose', () => {
  it('con matrices de hueso identidad, la posición horneada es igual a la original', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4));
    const hueso = new THREE.Bone();
    const skeleton = new THREE.Skeleton([hueso]);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(hueso);
    mesh.bind(skeleton);
    const horneada = hornearPose(mesh);
    const p = horneada.attributes.position;
    expect(p.getX(0)).toBeCloseTo(1);
    expect(p.getY(0)).toBeCloseTo(2);
    expect(p.getZ(0)).toBeCloseTo(3);
    expect(p.getX(1)).toBeCloseTo(4);
  });

  it('con un hueso movido DESPUÉS del bind, la posición horneada se desplaza según el peso', () => {
    const geo = new THREE.BufferGeometry();
    // 1 vértice en el origen, 100% peso en el hueso único.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const hueso = new THREE.Bone();
    const skeleton = new THREE.Skeleton([hueso]);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(hueso);
    mesh.bind(skeleton); // bind pose: hueso en el origen -> boneInverse = identidad
    // Mover el hueso DESPUÉS del bind (simula posicionar el esqueleto en una
    // pose no neutra antes de hornear) y refrescar matrixWorld.
    hueso.position.set(5, 0, 0);
    mesh.updateMatrixWorld(true);
    const horneada = hornearPose(mesh);
    const p = horneada.attributes.position;
    expect(p.getX(0)).toBeCloseTo(5);
    expect(p.getY(0)).toBeCloseTo(0);
    expect(p.getZ(0)).toBeCloseTo(0);
  });

  it('produce una BufferGeometry sin atributos de skinning (apta para InstancedMesh)', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.1, 0.2]), 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const hueso = new THREE.Bone();
    const skeleton = new THREE.Skeleton([hueso]);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(hueso);
    mesh.bind(skeleton);
    const horneada = hornearPose(mesh);
    expect(horneada.attributes.skinIndex).toBeUndefined();
    expect(horneada.attributes.skinWeight).toBeUndefined();
    expect(horneada.attributes.uv).toBeDefined();
    expect(horneada.attributes.normal).toBeDefined();
  });
});
