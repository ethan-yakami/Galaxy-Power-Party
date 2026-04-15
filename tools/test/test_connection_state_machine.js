const assert = require('assert');

const machine = require('../../src/client/js/connection-state-machine');

function hasEffect(effects, type) {
  return Array.isArray(effects) && effects.some((effect) => effect && effect.type === type);
}

function main() {
  let state = machine.createInitialState({ reconnectDelayMs: 1000, maxReconnectDelayMs: 8000 });
  assert.strictEqual(state.status, machine.STATES.IDLE);

  let t = machine.transition(state, machine.EVENTS.APP_START, {});
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.CONNECTING);
  assert(hasEffect(t.effects, machine.EFFECTS.CANCEL_RECONNECT));

  t = machine.transition(state, machine.EVENTS.SOCKET_OPEN, { welcomeTimeoutMs: 6000 });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.AWAITING_WELCOME);
  assert(hasEffect(t.effects, machine.EFFECTS.START_WELCOME_WATCHDOG));

  t = machine.transition(state, machine.EVENTS.WELCOME, {
    shouldResume: true,
    shouldJoinIntent: false,
    roomAckTimeoutMs: 8000,
  });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.RESUMING);
  assert.strictEqual(state.resumePending, true);
  assert(hasEffect(t.effects, machine.EFFECTS.START_ROOM_ACK_WATCHDOG));

  t = machine.transition(state, machine.EVENTS.RESUME_FAIL, {
    shouldJoinIntent: true,
    roomAckTimeoutMs: 8000,
  });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.READY);
  assert.strictEqual(state.resumePending, false);
  assert.strictEqual(state.roomAckPending, false);

  t = machine.transition(state, machine.EVENTS.INTENT_RETRY, { roomAckTimeoutMs: 8000 });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.JOINING_ROOM);
  assert.strictEqual(state.launchIntentConsumed, true);
  assert.strictEqual(state.roomAckPending, true);

  t = machine.transition(state, machine.EVENTS.ROOM_STATE, { inRoom: true });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.IN_ROOM);
  assert.strictEqual(state.roomAckPending, false);
  assert(hasEffect(t.effects, machine.EFFECTS.STOP_ROOM_ACK_WATCHDOG));

  t = machine.transition(state, machine.EVENTS.SOCKET_CLOSE, { reason: 'closed' });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.RETRY_WAIT);
  assert.strictEqual(state.reconnectDelayMs, 2000);
  const reconnectEffect = t.effects.find((effect) => effect.type === machine.EFFECTS.SCHEDULE_RECONNECT);
  assert(reconnectEffect, 'should schedule reconnect');
  assert.strictEqual(reconnectEffect.waitMs, 1000);

  t = machine.transition(state, machine.EVENTS.APP_START, {});
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.CONNECTING);
  assert.strictEqual(state.roomAckPending, false);

  t = machine.transition(state, machine.EVENTS.WELCOME, {
    shouldResume: false,
    shouldJoinIntent: true,
    roomAckTimeoutMs: 8000,
  });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.READY);
  assert.strictEqual(state.roomAckPending, false);

  t = machine.transition(state, machine.EVENTS.WATCHDOG_TIMEOUT, { kind: 'room_ack' });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.FAILED);
  assert.strictEqual(state.launchIntentConsumed, false);

  t = machine.transition(state, machine.EVENTS.USER_RECONNECT, { resetLaunchIntentConsumed: true });
  state = t.state;
  assert.strictEqual(state.status, machine.STATES.CONNECTING);
  assert.strictEqual(state.launchIntentConsumed, false);

  console.log('connection-state-machine tests passed');
}

main();

