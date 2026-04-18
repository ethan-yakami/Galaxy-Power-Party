import { createBattleDom } from './create-battle-dom.js';
import { createBattleLogger } from './create-battle-logger.js';
import { createBattleState } from './create-battle-state.js';
import { installBattleCompatBridge } from './install-battle-compat-bridge.js';
import { parseLaunchIntent } from './launch-intent.js';

/**
 * @param {{
 *   document: Document,
 *   location: { pathname: string, search: string, protocol: string },
 *   runtimeLoader?: (options: { document: Document, launchMode?: string | null, logger: any }) => Promise<any>,
 *   windowRef: any,
 * }} options
 */
export async function createBattleApp(options) {
  const { document, location, runtimeLoader, windowRef } = options;
  const launch = parseLaunchIntent(location);
  const logger = createBattleLogger({ scope: 'client.battle-app' });
  const startedAt = Date.now();
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
    startupTiming: {
      battle_bootstrap_started_at: startedAt,
      battle_runtime_ready_at: 0,
      socket_connect_requested_at: 0,
      welcome_received_at: 0,
      auth_state_received_at: 0,
      launch_intent_dispatched_at: 0,
      room_state_received_at: 0,
      loader_mode: 'unknown',
      loader_script_count: 0,
      loader_started_at: startedAt,
      loader_fetch_started_at: 0,
      loader_fetch_completed_at: 0,
      loader_completed_at: 0,
    },
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

  const resolvedRuntimeLoader = runtimeLoader || (await import('./load-battle-runtime.js')).loadBattleRuntime;
  const runtimeMetrics = await resolvedRuntimeLoader({
    document,
    launchMode: launch.intent ? launch.intent.mode : '',
    logger,
  });
  app.startupTiming.loader_mode = runtimeMetrics.loaderMode;
  app.startupTiming.loader_script_count = runtimeMetrics.scriptCount;
  app.startupTiming.loader_started_at = runtimeMetrics.startedAt;
  app.startupTiming.loader_fetch_started_at = runtimeMetrics.fetchStartedAt;
  app.startupTiming.loader_fetch_completed_at = runtimeMetrics.fetchCompletedAt;
  app.startupTiming.loader_completed_at = runtimeMetrics.completedAt;
  app.startupTiming.battle_runtime_ready_at = Date.now();

  logger.info('bootstrap_completed', {
    scriptsLoaded: true,
    launchMode: launch.intent ? launch.intent.mode : null,
    loaderMode: runtimeMetrics.loaderMode,
    runtimeReadyMs: app.startupTiming.battle_runtime_ready_at - startedAt,
  });
  windowRef.__GPP_BATTLE_APP__ = app;
  return app;
}
