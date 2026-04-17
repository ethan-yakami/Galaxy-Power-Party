import { describeErrorCode } from './protocol/error-registry.js';

/**
 * @param {{
 *   config: { wsProtocol: string, protocolVersion: string, maxReconnectDelay: number },
 *   diagnostics: Array<Record<string, unknown>>,
 *   dom: Record<string, HTMLElement | null>,
 *   logger: ReturnType<typeof import('./create-battle-logger.js').createBattleLogger>,
 *   state: Record<string, any>,
 *   startupTiming?: Record<string, number | string>,
 *   transport: { requestCounter: number, ws: WebSocket | null },
 *   windowRef: any,
 * }} app
 */
export function installBattleCompatBridge(app) {
  const bridge = app.windowRef.GPP || {};

  function asNumber(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function getStartupTimingSummary() {
    const timing = app.startupTiming || {};
    const summary = {
      loader_mode: timing.loader_mode || 'unknown',
      loader_script_count: timing.loader_script_count || 0,
    };

    if (timing.battle_bootstrap_started_at && timing.battle_runtime_ready_at) {
      summary.runtime_boot_ms = asNumber(timing.battle_runtime_ready_at) - asNumber(timing.battle_bootstrap_started_at);
    }
    if (timing.loader_fetch_started_at && timing.loader_fetch_completed_at) {
      summary.loader_fetch_ms = asNumber(timing.loader_fetch_completed_at) - asNumber(timing.loader_fetch_started_at);
    }
    if (timing.socket_connect_requested_at && timing.welcome_received_at) {
      summary.socket_to_welcome_ms = asNumber(timing.welcome_received_at) - asNumber(timing.socket_connect_requested_at);
    }
    if (timing.welcome_received_at && timing.launch_intent_dispatched_at) {
      summary.welcome_to_launch_ms = asNumber(timing.launch_intent_dispatched_at) - asNumber(timing.welcome_received_at);
    }
    if (timing.launch_intent_dispatched_at && timing.room_state_received_at) {
      summary.launch_to_room_ms = asNumber(timing.room_state_received_at) - asNumber(timing.launch_intent_dispatched_at);
    }
    if (timing.battle_bootstrap_started_at && timing.room_state_received_at) {
      summary.total_to_room_ms = asNumber(timing.room_state_received_at) - asNumber(timing.battle_bootstrap_started_at);
    }
    return summary;
  }

  function markStartupTiming(key, value = Date.now()) {
    if (!app.startupTiming || !key) return 0;
    const normalized = Number.isFinite(value) ? value : Date.now();
    if (!app.startupTiming[key]) {
      app.startupTiming[key] = normalized;
    }
    return app.startupTiming[key];
  }

  function markAppTiming(key, value = Date.now()) {
    if (!key) return 0;
    const rootApp = app.windowRef.__GPP_APP__ && typeof app.windowRef.__GPP_APP__ === 'object'
      ? app.windowRef.__GPP_APP__
      : null;
    if (!rootApp) return 0;
    if (!rootApp.startupTiming || typeof rootApp.startupTiming !== 'object') {
      rootApp.startupTiming = {};
    }
    const normalized = Number.isFinite(value) ? value : Date.now();
    if (!rootApp.startupTiming[key]) {
      rootApp.startupTiming[key] = normalized;
    }
    return rootApp.startupTiming[key];
  }

  function logStartupTimingSummary(reason, extra = {}) {
    app.logger.info('startup_timing_summary', {
      reason,
      ...getStartupTimingSummary(),
      ...extra,
    });
  }

  function nextRequestId() {
    app.transport.requestCounter += 1;
    return `battle-${app.transport.requestCounter}`;
  }

  function setMessage(message) {
    if (app.dom.messageEl) {
      app.dom.messageEl.textContent = message || '';
    }
  }

  function send(type, payload = {}) {
    if (!app.transport.ws || app.transport.ws.readyState !== WebSocket.OPEN) {
      app.logger.warn('send_skipped_socket_not_open', { type });
      return;
    }

    const payloadRecord = payload && typeof payload === 'object'
      ? /** @type {{ meta?: Record<string, string> }} */ (payload)
      : null;
    const meta = Object.assign(
      {
        protocolVersion: app.config.protocolVersion,
        requestId: nextRequestId(),
      },
      payloadRecord && payloadRecord.meta && !Array.isArray(payloadRecord.meta)
        ? payloadRecord.meta
        : {}
    );

    const envelope = {
      type,
      ...(payload || {}),
      meta,
    };
    app.logger.debug('socket_send', { type, requestId: meta.requestId });
    app.transport.ws.send(JSON.stringify(envelope));
  }

  function sendWithFeedback(type, label, payload) {
    app.state.pendingAction = label;
    if (typeof bridge.render === 'function') {
      bridge.render();
    }
    send(type, payload);
  }

  Object.defineProperties(bridge, {
    state: {
      configurable: true,
      enumerable: true,
      get() {
        return app.state;
      },
    },
    dom: {
      configurable: true,
      enumerable: true,
      get() {
        return app.dom;
      },
    },
    wsProtocol: {
      configurable: true,
      enumerable: true,
      get() {
        return app.config.wsProtocol;
      },
    },
    ws: {
      configurable: true,
      enumerable: true,
      get() {
        return app.transport.ws;
      },
      set(value) {
        app.transport.ws = value;
      },
    },
    MAX_RECONNECT_DELAY: {
      configurable: true,
      enumerable: true,
      get() {
        return app.config.maxReconnectDelay;
      },
    },
    logger: {
      configurable: true,
      enumerable: true,
      get() {
        return app.logger;
      },
    },
    startupTiming: {
      configurable: true,
      enumerable: true,
      get() {
        return app.startupTiming;
      },
    },
  });

  Object.assign(bridge, {
    diagnostics: app.logger.diagnostics,
    getErrorDescriptor: describeErrorCode,
    markStartupTiming,
    getStartupTimingSummary,
    logStartupTimingSummary,
    markAppTiming,
    send,
    sendWithFeedback,
    setMessage,
    render() {},
  });

  app.windowRef.GPP = bridge;
}
