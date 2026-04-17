const BATTLE_RUNTIME_SCRIPTS = Object.freeze([
  'shared/replay-schema.js',
  'shared/preset-schema.js',
  'shared/protocol/error-registry.js',
  'shared/protocol/versioning.js',
  'js/url-utils.js',
  'js/auth.js',
  'js/replay-history.js',
  'js/connection-state-machine.js',
  'js/connection-launch-flow.js',
  'js/connection-message-router.js',
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
]);

async function loadBrowserBattleRuntime(options) {
  const startedAt = Date.now();
  const documentRef = options.document;
  const windowRef = documentRef.defaultView || globalThis;
  const fetchImpl = windowRef.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for test battle runtime loader');
  }

  for (const src of BATTLE_RUNTIME_SCRIPTS) {
    const url = new URL(src, documentRef.baseURI).toString();
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
    }
    const code = await response.text();
    windowRef.eval(`${String(code || '')}\n//# sourceURL=${url}`);
  }

  return {
    loaderMode: 'test_fetch_eval',
    scriptCount: BATTLE_RUNTIME_SCRIPTS.length,
    startedAt,
    fetchStartedAt: startedAt,
    fetchCompletedAt: Date.now(),
    completedAt: Date.now(),
  };
}

module.exports = {
  loadBrowserBattleRuntime,
};
