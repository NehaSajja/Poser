import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene, Vector2 } from 'three';
import { createLightOrb, LIGHT_ORB_LAYER, pickLightOrb } from '../src/poser2/lightOrb.js';

test('the orb is picked at its world position and cannot be grabbed through the model', () => {
  const scene = new Scene(), camera = new OrthographicCamera(-2, 2, 2, -2, .1, 20);
  camera.position.z = 5; camera.updateMatrixWorld();
  const ray = new Raycaster(); ray.layers.enable(LIGHT_ORB_LAYER);
  const orb = createLightOrb(.12);
  scene.add(orb.object);
  const pick = x => { ray.setFromCamera(new Vector2(x, 0), camera); return pickLightOrb(ray, orb, scene); };
  assert.equal(pick(0), true);
  orb.object.position.x = .5;
  assert.equal(pick(0), false);
  assert.equal(pick(.25), true);
  camera.zoom = 2; camera.updateProjectionMatrix();
  assert.equal(pick(.25), false);
  assert.equal(pick(.5), true);

  const model = new Mesh(new BoxGeometry(.4, .4, .4), new MeshBasicMaterial());
  model.castShadow = true; model.position.set(.5, 0, 1); scene.add(model);
  assert.equal(pick(.5), false);
  model.position.z = -1;
  assert.equal(pick(.5), true);
  model.position.z = 1; model.visible = false;
  assert.equal(pick(.5), true);
  orb.object.visible = false;
  assert.equal(pick(.5), false);
  orb.dispose(); model.geometry.dispose(); model.material.dispose();
});

test('the orb stays out of contact shadows and releases its GPU resources on close', () => {
  const scene = new Scene(), shadowCamera = new OrthographicCamera();
  const orb = createLightOrb(.12); scene.add(orb.object);
  let geometries = 0, materials = 0;
  orb.core.geometry.addEventListener('dispose', () => geometries++);
  for (const mesh of orb.object.children) {
    assert.equal(shadowCamera.layers.test(mesh.layers), false);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.material.depthTest, true);
    mesh.material.addEventListener('dispose', () => materials++);
  }
  orb.dispose();
  assert.equal(scene.children.includes(orb.object), false);
  assert.equal(geometries, 1);
  assert.equal(materials, 2);
});
