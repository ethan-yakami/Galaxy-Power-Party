(function initConnectionStateMachine(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPConnectionStateMachine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildConnectionStateMachine() {
  const STATES = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    AWAITING_WELCOME: 'awaiting_welcome',
    RESUMING: 'resuming',
    READY: 'ready',
    JOINING_ROOM: 'joining_room',
    IN_ROOM: 'in_room',
    RETRY_WAIT: 'retry_wait',
    FAILED: 'failed',
  });

  const EVENTS = Object.freeze({
    APP_START: 'APP_START',
    SOCKET_OPEN: 'SOCKET_OPEN',
    WELCOME: 'WELCOME',
    RESUME_OK: 'RESUME_OK',
    RESUME_FAIL: 'RESUME_FAIL',
    ROOM_STATE: 'ROOM_STATE',
    SOCKET_CLOSE: 'SOCKET_CLOSE',
    WATCHDOG_TIMEOUT: 'WATCHDOG_TIMEOUT',
    USER_RECONNECT: 'USER_RECONNECT',
    INTENT_RETRY: 'INTENT_RETRY',
    LEFT_ROOM: 'LEFT_ROOM',
    CONNECT_ERROR: 'CONNECT_ERROR',
  });

  const EFFECTS = Object.freeze({
    START_WELCOME_WATCHDOG: 'start_welcome_watchdog',
    STOP_WELCOME_WATCHDOG: 'stop_welcome_watchdog',
    START_ROOM_ACK_WATCHDOG: 'start_room_ack_watchdog',
    STOP_ROOM_ACK_WATCHDOG: 'stop_room_ack_watchdog',
    SCHEDULE_RECONNECT: 'schedule_reconnect',
    CANCEL_RECONNECT: 'cancel_reconnect',
  });

  function createInitialState(options) {
    const opts = options || {};
    const reconnectDelayMs = Number.isInteger(opts.reconnectDelayMs) ? opts.reconnectDelayMs : 1000;
    const maxReconnectDelayMs = Number.isInteger(opts.maxReconnectDelayMs) ? opts.maxReconnectDelayMs : 15000;
    return {
      status: STATES.IDLE,
      reconnectDelayMs,
      baseReconnectDelayMs: reconnectDelayMs,
      maxReconnectDelayMs,
      welcomeReceived: false,
      resumePending: false,
      roomAckPending: false,
      launchIntentConsumed: false,
      lastError: '',
    };
  }

  function clampReconnect(value, maxValue) {
    const n = Number.isInteger(value) ? value : 1000;
    const max = Number.isInteger(maxValue) ? maxValue : 15000;
    if (n < 1000) return 1000;
    if (n > max) return max;
    return n;
  }

  function transition(prevState, event, payload) {
    const state = Object.assign({}, prevState || createInitialState());
    const data = payload || {};
    const effects = [];

    switch (event) {
      case EVENTS.APP_START:
      case EVENTS.USER_RECONNECT: {
        state.status = STATES.CONNECTING;
        state.welcomeReceived = false;
        state.resumePending = false;
        state.roomAckPending = false;
        if (data.resetLaunchIntentConsumed) {
          state.launchIntentConsumed = false;
        }
        effects.push({ type: EFFECTS.CANCEL_RECONNECT });
        effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        break;
      }

      case EVENTS.SOCKET_OPEN: {
        state.status = STATES.AWAITING_WELCOME;
        state.welcomeReceived = false;
        state.resumePending = false;
        state.roomAckPending = false;
        state.reconnectDelayMs = state.baseReconnectDelayMs;
        effects.push({ type: EFFECTS.CANCEL_RECONNECT });
        effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        effects.push({
          type: EFFECTS.START_WELCOME_WATCHDOG,
          timeoutMs: Number.isInteger(data.welcomeTimeoutMs) ? data.welcomeTimeoutMs : 6000,
        });
        break;
      }

      case EVENTS.WELCOME: {
        state.welcomeReceived = true;
        effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        if (data.shouldResume) {
          state.status = STATES.RESUMING;
          state.resumePending = true;
          state.roomAckPending = true;
          effects.push({
            type: EFFECTS.START_ROOM_ACK_WATCHDOG,
            timeoutMs: Number.isInteger(data.roomAckTimeoutMs) ? data.roomAckTimeoutMs : 8000,
          });
        } else if (data.shouldJoinIntent) {
          // Join intent is triggered explicitly by INTENT_RETRY when we actually send room actions.
          state.status = STATES.READY;
          state.resumePending = false;
          state.roomAckPending = false;
          effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        } else {
          state.status = STATES.READY;
          state.resumePending = false;
          state.roomAckPending = false;
          effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        }
        break;
      }

      case EVENTS.RESUME_OK: {
        state.status = STATES.READY;
        state.resumePending = false;
        state.roomAckPending = false;
        state.launchIntentConsumed = true;
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        break;
      }

      case EVENTS.RESUME_FAIL: {
        state.resumePending = false;
        state.roomAckPending = false;
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        if (data.shouldJoinIntent) {
          // Resume fail only unblocks fallback join; actual join attempt starts on INTENT_RETRY.
          state.status = STATES.READY;
        } else {
          state.status = STATES.READY;
        }
        break;
      }

      case EVENTS.INTENT_RETRY: {
        state.status = STATES.JOINING_ROOM;
        state.launchIntentConsumed = true;
        state.roomAckPending = true;
        effects.push({
          type: EFFECTS.START_ROOM_ACK_WATCHDOG,
          timeoutMs: Number.isInteger(data.roomAckTimeoutMs) ? data.roomAckTimeoutMs : 8000,
        });
        break;
      }

      case EVENTS.ROOM_STATE: {
        state.resumePending = false;
        state.roomAckPending = false;
        if (data.inRoom) state.launchIntentConsumed = true;
        state.status = data.inRoom ? STATES.IN_ROOM : STATES.READY;
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        break;
      }

      case EVENTS.LEFT_ROOM: {
        state.resumePending = false;
        state.roomAckPending = false;
        state.launchIntentConsumed = false;
        state.status = STATES.READY;
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        break;
      }

      case EVENTS.WATCHDOG_TIMEOUT: {
        state.roomAckPending = false;
        state.resumePending = false;
        state.status = STATES.FAILED;
        if (data.kind === 'room_ack') {
          state.launchIntentConsumed = false;
          effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        }
        if (data.kind === 'welcome') {
          effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        }
        break;
      }

      case EVENTS.SOCKET_CLOSE: {
        const waitMs = clampReconnect(state.reconnectDelayMs, state.maxReconnectDelayMs);
        state.welcomeReceived = false;
        state.resumePending = false;
        state.roomAckPending = false;
        state.status = STATES.RETRY_WAIT;
        state.reconnectDelayMs = clampReconnect(waitMs * 2, state.maxReconnectDelayMs);
        effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        effects.push({
          type: EFFECTS.SCHEDULE_RECONNECT,
          waitMs,
          reason: data.reason || '',
        });
        break;
      }

      case EVENTS.CONNECT_ERROR: {
        state.status = STATES.FAILED;
        state.lastError = data.error || '';
        effects.push({ type: EFFECTS.CANCEL_RECONNECT });
        effects.push({ type: EFFECTS.STOP_WELCOME_WATCHDOG });
        effects.push({ type: EFFECTS.STOP_ROOM_ACK_WATCHDOG });
        break;
      }

      default:
        break;
    }

    return { state, effects };
  }

  return Object.freeze({
    STATES,
    EVENTS,
    EFFECTS,
    createInitialState,
    transition,
  });
});
