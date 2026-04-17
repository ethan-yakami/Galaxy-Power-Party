import replaySchemaSource from '../js/replay-schema.js?raw';
import presetSchemaSource from '../js/preset-schema.js?raw';
import protocolErrorRegistrySource from '../../core/shared/protocol/error-registry.js?raw';
import protocolVersioningSource from '../../core/shared/protocol/versioning.js?raw';
import urlUtilsSource from '../js/url-utils.js?raw';
import authSource from '../js/auth.js?raw';
import replayHistorySource from '../js/replay-history.js?raw';
import connectionStateMachineSource from '../js/connection-state-machine.js?raw';
import connectionLaunchFlowSource from '../js/connection-launch-flow.js?raw';
import connectionMessageRouterSource from '../js/connection-message-router.js?raw';
import battleViewModelSource from '../js/battle-view-model.js?raw';
import stateSelectorsSource from '../js/state-selectors.js?raw';
import battleActionMapSource from '../js/battle-action-map.js?raw';
import guideDataSource from '../js/guide-data.js?raw';
import uiGlossarySource from '../js/ui-glossary.js?raw';
import uiModalControllerSource from '../js/ui-modal-controller.js?raw';
import uiSource from '../js/ui.js?raw';
import effectsSource from '../js/effects.js?raw';
import diceUiSource from '../js/dice-ui.js?raw';
import renderSource from '../js/render.js?raw';
import connectionSource from '../js/connection.js?raw';

const CRITICAL_RUNTIME_SOURCES = Object.freeze([
  { src: 'shared/replay-schema.js', code: replaySchemaSource },
  { src: 'shared/preset-schema.js', code: presetSchemaSource },
  { src: 'shared/protocol/error-registry.js', code: protocolErrorRegistrySource },
  { src: 'shared/protocol/versioning.js', code: protocolVersioningSource },
  { src: 'js/url-utils.js', code: urlUtilsSource },
  { src: 'js/auth.js', code: authSource },
  { src: 'js/connection-state-machine.js', code: connectionStateMachineSource },
  { src: 'js/connection-launch-flow.js', code: connectionLaunchFlowSource },
  { src: 'js/connection-message-router.js', code: connectionMessageRouterSource },
  { src: 'js/battle-view-model.js', code: battleViewModelSource },
  { src: 'js/state-selectors.js', code: stateSelectorsSource },
  { src: 'js/battle-action-map.js', code: battleActionMapSource },
  { src: 'js/ui.js', code: uiSource },
  { src: 'js/effects.js', code: effectsSource },
  { src: 'js/dice-ui.js', code: diceUiSource },
  { src: 'js/render.js', code: renderSource },
  { src: 'js/connection.js', code: connectionSource },
]);

const FEATURE_SET_SOURCES = Object.freeze({
  replay: Object.freeze([
    { src: 'js/replay-history.js', code: replayHistorySource },
  ]),
  ui: Object.freeze([
    { src: 'js/guide-data.js', code: guideDataSource },
    { src: 'js/ui-glossary.js', code: uiGlossarySource },
    { src: 'js/ui-modal-controller.js', code: uiModalControllerSource },
  ]),
});

export const LEGACY_RUNTIME_SCRIPTS = Object.freeze([
  ...CRITICAL_RUNTIME_SOURCES.map((entry) => entry.src),
  ...FEATURE_SET_SOURCES.replay.map((entry) => entry.src),
  ...FEATURE_SET_SOURCES.ui.map((entry) => entry.src),
]);

/**
 * @param {{
 *   document: Document,
 *   launchMode?: string | null,
 *   logger: {
 *     debug(event: string, context?: Record<string, unknown>): void,
 *     warn?(event: string, context?: Record<string, unknown>): void,
 *   },
 * }} options
 */
export async function loadLegacyBattleRuntime(options) {
  const startedAt = Date.now();
  const documentRef = options.document;
  const windowRef = documentRef.defaultView || globalThis;
  const launchMode = typeof options.launchMode === 'string' ? options.launchMode : '';

  installDeferredFeatureLoader(windowRef, options.logger);

  const criticalSources = CRITICAL_RUNTIME_SOURCES.slice();
  if (launchMode === 'replay') {
    const replayInsertIndex = criticalSources.findIndex((entry) => entry.src === 'js/connection-state-machine.js');
    const insertAt = replayInsertIndex >= 0 ? replayInsertIndex : criticalSources.length;
    criticalSources.splice(insertAt, 0, ...FEATURE_SET_SOURCES.replay);
  }

  evaluateSources(windowRef, documentRef, criticalSources, options.logger, 'bundle_eval');

  return {
    loaderMode: 'bundle_eval',
    scriptCount: criticalSources.length,
    startedAt,
    fetchStartedAt: 0,
    fetchCompletedAt: 0,
    completedAt: Date.now(),
    deferredFeatureSets: Object.keys(FEATURE_SET_SOURCES),
  };
}

/**
 * @param {any} windowRef
 * @param {Document} documentRef
 * @param {Array<{ src: string, code: string }>} sources
 * @param {{ debug(event: string, context?: Record<string, unknown>): void }} logger
 * @param {string} mode
 */
function evaluateSources(windowRef, documentRef, sources, logger, mode) {
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const resolvedUrl = new URL(source.src, documentRef.baseURI).toString();
    evaluateScript(windowRef, resolvedUrl, source.code);
    logger.debug('legacy_script_loaded', {
      src: source.src,
      mode,
    });
  }
}

/**
 * @param {any} windowRef
 * @param {{ debug(event: string, context?: Record<string, unknown>): void, warn?(event: string, context?: Record<string, unknown>): void }} logger
 */
function installDeferredFeatureLoader(windowRef, logger) {
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
    if (!Object.prototype.hasOwnProperty.call(FEATURE_SET_SOURCES, featureSet)) {
      return Promise.resolve(false);
    }
    if (featurePromises.has(featureSet)) {
      return featurePromises.get(featureSet);
    }

    const promise = Promise.resolve().then(() => {
      evaluateSources(windowRef, windowRef.document, FEATURE_SET_SOURCES[featureSet], logger, 'deferred_bundle_eval');
      return true;
    }).catch((error) => {
      featurePromises.delete(featureSet);
      if (typeof logger.warn === 'function') {
        logger.warn('legacy_feature_set_failed', {
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

/**
 * @param {any} windowRef
 * @param {string} url
 * @param {string} code
 */
function evaluateScript(windowRef, url, code) {
  windowRef.eval(`${String(code || '')}\n//# sourceURL=${url}`);
}
