import {
  BATTLE_RUNTIME_CRITICAL_SCRIPTS,
  BATTLE_RUNTIME_DEFERRED_SOURCE_SETS,
  BATTLE_RUNTIME_SCRIPTS,
} from './runtime-source-manifest.js';
import { evaluateRuntimeSources, loadRuntimeSources } from './runtime-source-loader.js';

export { BATTLE_RUNTIME_SCRIPTS };

/**
 * @param {{
 *   document: Document,
 *   launchMode?: string | null,
 *   logger: {
 *     debug(event: string, context?: Record<string, unknown>): void,
 *     warn?(event: string, context?: Record<string, unknown>): void,
 *   },
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export async function loadBattleRuntime(options) {
  const startedAt = Date.now();
  const documentRef = options.document;
  const windowRef = documentRef.defaultView || globalThis;
  const launchMode = typeof options.launchMode === 'string' ? options.launchMode : '';

  installDeferredFeatureLoader(windowRef, documentRef, options.logger, options.fetchImpl);

  const criticalSources = BATTLE_RUNTIME_CRITICAL_SCRIPTS.slice();
  if (launchMode === 'replay') {
    const replayInsertIndex = criticalSources.findIndex((entry) => entry === 'js/connection-state-machine.js');
    const insertAt = replayInsertIndex >= 0 ? replayInsertIndex : criticalSources.length;
    criticalSources.splice(insertAt, 0, ...BATTLE_RUNTIME_DEFERRED_SOURCE_SETS.replay);
  }

  const loaded = await loadRuntimeSources({
    documentRef,
    sources: criticalSources,
    fetchImpl: options.fetchImpl,
  });
  evaluateRuntimeSources(windowRef, loaded.sources);

  for (const source of loaded.sources) {
    options.logger.debug('battle_runtime_script_loaded', {
      src: source.src,
      mode: 'runtime_fetch_eval',
    });
  }

  return {
    loaderMode: 'runtime_fetch_eval',
    scriptCount: criticalSources.length,
    startedAt,
    fetchStartedAt: loaded.fetchStartedAt,
    fetchCompletedAt: loaded.fetchCompletedAt,
    completedAt: Date.now(),
    deferredFeatureSets: Object.keys(BATTLE_RUNTIME_DEFERRED_SOURCE_SETS),
  };
}

/**
 * @param {any} windowRef
 * @param {Document} documentRef
 * @param {{ debug(event: string, context?: Record<string, unknown>): void, warn?(event: string, context?: Record<string, unknown>): void }} logger
 * @param {typeof fetch | undefined} fetchImpl
 */
function installDeferredFeatureLoader(windowRef, documentRef, logger, fetchImpl) {
  const bridge = windowRef.GPP || {};
  if (bridge.ensureBattleFeatureSet && bridge.preloadDeferredBattleFeatures) {
    return;
  }

  const featurePromises = new Map();
  let preloadScheduled = false;

  /**
   * @param {string} featureSet
   */
  function ensureBattleFeatureSet(featureSet) {
    if (!Object.prototype.hasOwnProperty.call(BATTLE_RUNTIME_DEFERRED_SOURCE_SETS, featureSet)) {
      return Promise.resolve(false);
    }
    if (featurePromises.has(featureSet)) {
      return featurePromises.get(featureSet);
    }

    const promise = loadRuntimeSources({
      documentRef,
      sources: BATTLE_RUNTIME_DEFERRED_SOURCE_SETS[featureSet],
      fetchImpl,
    }).then((loaded) => {
      evaluateRuntimeSources(windowRef, loaded.sources);
      for (const source of loaded.sources) {
        logger.debug('battle_runtime_script_loaded', {
          src: source.src,
          mode: 'runtime_fetch_eval_deferred',
          featureSet,
        });
      }
      return true;
    }).catch((error) => {
      featurePromises.delete(featureSet);
      if (typeof logger.warn === 'function') {
        logger.warn('battle_feature_set_failed', {
          featureSet,
          message: error && error.message ? error.message : String(error),
        });
      }
      throw error;
    });

    featurePromises.set(featureSet, promise);
    return promise;
  }

  function scheduleIdle(callback) {
    if (typeof windowRef.requestIdleCallback === 'function') {
      windowRef.requestIdleCallback(() => callback());
      return;
    }
    windowRef.setTimeout(callback, 150);
  }

  function preloadDeferredBattleFeatures() {
    if (preloadScheduled) return;
    preloadScheduled = true;
    scheduleIdle(() => {
      Promise.allSettled([
        ensureBattleFeatureSet('ui'),
        ensureBattleFeatureSet('replay'),
      ]).finally(() => {
        preloadScheduled = false;
      });
    });
  }

  Object.assign(bridge, {
    ensureBattleFeatureSet,
    preloadDeferredBattleFeatures,
  });
  windowRef.GPP = bridge;
}
