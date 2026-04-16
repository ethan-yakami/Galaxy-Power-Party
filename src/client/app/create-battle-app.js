import { createBattleDom } from './create-battle-dom.js';
import { createBattleLogger } from './create-battle-logger.js';
import { createBattleState } from './create-battle-state.js';
import { installBattleCompatBridge } from './install-battle-compat-bridge.js';
import { loadLegacyBattleRuntime } from './load-legacy-battle-runtime.js';
import { parseLaunchIntent } from './launch-intent.js';

/**
 * @param {{
 *   document: Document,
 *   location: { pathname: string, search: string, protocol: string },
 *   windowRef: any,
 * }} options
 */
export async function createBattleApp(options) {
  const { document, location, windowRef } = options;
  const launch = parseLaunchIntent(location);
  const logger = createBattleLogger({ scope: 'client.battle-app' });
  const dom = createBattleDom(document);
  const state = createBattleState({
    launchIntent: launch.intent,
    launchIntentError: launch.error,
  });
  const app = {
    config: {
      wsProtocol: location.protocol === 'https:' ? 'wss:' : 'ws:',
      protocolVersion: '2',
      maxReconnectDelay: 15000,
    },
    diagnostics: [],
    document,
    dom,
    logger,
    state,
    transport: {
      requestCounter: 0,
      ws: null,
    },
    windowRef,
  };

  installBattleCompatBridge(app);
  logger.info('bootstrap_started', {
    path: location.pathname,
    search: location.search,
    launchMode: launch.intent ? launch.intent.mode : null,
  });

  await loadLegacyBattleRuntime({
    document,
    logger,
  });

  logger.info('bootstrap_completed', {
    scriptsLoaded: true,
    launchMode: launch.intent ? launch.intent.mode : null,
  });
  windowRef.__GPP_BATTLE_APP__ = app;
  return app;
}
