export const MEDIUM_NAMES = { poser2: 'poser', ui: 'Wireframe' };

export function resolveMedium(requested) {
  if (requested === 'poser' || requested === 'poser4') return 'poser2';
  return Object.hasOwn(MEDIUM_NAMES, requested) ? requested : 'poser2';
}

// Preserve drawings while freeing the old Poser 2 identity for the carousel.
// The marker distinguishes newly created/migrated pages on subsequent loads.
export function migratePoserPages(editor) {
  editor.run(() => {
    for (const page of editor.getPages()) {
      const medium = page.meta.medium;
      if (medium === 'poser4' || (medium === 'poser2' && page.meta.poserVersion === 'carousel' && page.name === 'Poser 2')) {
        editor.updatePage({ id: page.id, name: 'Poser', meta: { ...page.meta, medium: 'poser2', poserVersion: 'carousel' } });
      } else if (medium === 'poser3' || (medium === 'poser2' && page.meta.poserVersion !== 'carousel')) {
        editor.updatePage({ id: page.id, name: `Archived ${page.name}`, meta: { ...page.meta, medium: `archived-${medium}` } });
      }
    }
  }, { history: 'ignore' });
}
