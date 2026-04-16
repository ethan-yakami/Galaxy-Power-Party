import { describeErrorCode } from './protocol/error-registry.js';

/**
 * @param {{
 *   config: { wsProtocol: string, protocolVersion: string, maxReconnectDelay: number },
 *   diagnostics: Array<Record<string, unknown>>,
 *   dom: Record<string, HTMLElement | null>,
 *   logger: ReturnType<typeof import('./create-battle-logger.js').createBattleLogger>,
 *   state: Record<string, any>,
 *   transport: { requestCounter: number, ws: WebSocket | null },
 *   windowRef: any,
 * }} app
 */
export function installBattleCompatBridge(app) {
  const bridge = app.windowRef.GPP || {};

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
  });

  Object.assign(bridge, {
    diagnostics: app.logger.diagnostics,
    getErrorDescriptor: describeErrorCode,
    send,
    sendWithFeedback,
    setMessage,
    render() {},
  });

  app.windowRef.GPP = bridge;
}
