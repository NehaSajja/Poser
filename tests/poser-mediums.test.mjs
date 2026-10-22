import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIUM_NAMES, migratePoserPages, resolveMedium } from '../src/poser/mediums.js';

test('Poser is the only accessible workflow, including old Wireframe links', () => {
  assert.deepEqual(Object.keys(MEDIUM_NAMES), ['poser2', 'ui']);
  assert.equal(resolveMedium('poser4'), 'poser2');
  assert.equal(resolveMedium('poser2'), 'poser2');
  assert.equal(resolveMedium('poser3'), 'poser2');
  assert.equal(resolveMedium(null), 'poser2');
  assert.equal(resolveMedium('poser'), 'poser2');
  assert.equal(resolveMedium('ui'), 'poser2');
  assert.equal(MEDIUM_NAMES.poser2, 'poser');
});

test('saved carousel pages retain their identity and drawings without colliding with old Poser 2', () => {
  const pages = ['ui', 'poser', 'poser2', 'poser3', 'poser4'].map((medium, index) =>
    ({ id: `page:${index}`, name: medium, meta: { medium, custom: 'preserved' } }));
  const editor = { run: callback => callback(), getPages: () => structuredClone(pages),
    updatePage: page => Object.assign(pages.find(p => p.id === page.id), page) };
  migratePoserPages(editor);
  assert.equal(pages[4].id, 'page:4'); assert.equal(pages[4].meta.medium, 'poser2');
  assert.equal(pages[4].name, 'Poser'); assert.equal(pages[4].meta.custom, 'preserved');
  assert.equal(pages[2].meta.medium, 'archived-poser2');
  assert.equal(pages[3].meta.medium, 'archived-poser3');
  const once = structuredClone(pages);
  migratePoserPages(editor);
  assert.deepEqual(pages, once);
});
