const LEGACY_RUNTIME_SCRIPTS = [
  'shared/replay-schema.js',
  'shared/preset-schema.js',
  'shared/protocol/error-registry.js',
  'shared/protocol/versioning.js',
  'js/url-utils.js',
  'js/auth.js',
  'js/replay-history.js',
  'js/connection-state-machine.js',
  'js/battle-view-model.js',
  'js/state-selectors.js',
  'js/battle-action-map.js',
  'js/guide-data.js',
  'js/ui-glossary.js',
  'js/ui-modal-controller.js',
  'js/ui.js',
  'js/effects.js',
  'js/dice-ui.js',
  'js/render.js',
  'js/connection.js',
];

/**
 * @param {{ document: Document, logger: { debug(event: string, context?: Record<string, unknown>): void } }} options
 */
export async function loadLegacyBattleRuntime(options) {
  for (const src of LEGACY_RUNTIME_SCRIPTS) {
    await loadScript(options.document, src);
    options.logger.debug('legacy_script_loaded', { src });
  }
}

/**
 * @param {Document} documentRef
 * @param {string} src
 */
function loadScript(documentRef, src) {
  return new Promise((resolve, reject) => {
    const resolvedSrc = new URL(src, documentRef.baseURI).toString();
    const existing = documentRef.querySelector(`script[data-legacy-src="${resolvedSrc}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = documentRef.createElement('script');
    script.async = false;
    script.dataset.legacySrc = resolvedSrc;
    script.src = resolvedSrc;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${resolvedSrc}`));
    documentRef.body.appendChild(script);
  });
}
