const assert = require('assert');

const launchFlow = require('../../src/client/js/connection-launch-flow');

function main() {
  const uiState = {};

  const initial = launchFlow.ensureLaunchFlow(uiState);
  assert.strictEqual(initial.roomRequestSent, false);
  assert.strictEqual(initial.roomAckReceived, false);
  assert.strictEqual(initial.retryCount, 0);

  const sourceIntent = { mode: 'ai', name: 'Nova', nested: { code: '1234' } };
  launchFlow.rememberLaunchIntent(uiState, sourceIntent);
  assert.strictEqual(uiState.launchIntent.mode, 'ai');
  assert.notStrictEqual(uiState.launchIntent, sourceIntent);
  assert.notStrictEqual(uiState.launchIntent.nested, sourceIntent.nested);
  sourceIntent.nested.code = 'mutated';
  assert.strictEqual(uiState.launchIntent.nested.code, '1234');
  assert.strictEqual(uiState.launchIntentConsumed, false);

  launchFlow.markLaunchRequestSent(uiState);
  assert.strictEqual(uiState.launchFlow.roomRequestSent, true);
  assert.strictEqual(uiState.launchFlow.roomAckReceived, false);

  launchFlow.resetLaunchRequest(uiState, 'room_timeout');
  assert.strictEqual(uiState.launchFlow.roomRequestSent, false);
  assert.strictEqual(uiState.launchFlow.roomAckReceived, false);
  assert.strictEqual(uiState.launchFlow.lastError, 'room_timeout');
  assert.strictEqual(uiState.launchFlow.retryCount, 1);

  launchFlow.markLaunchAckReceived(uiState);
  assert.strictEqual(uiState.launchFlow.roomRequestSent, false);
  assert.strictEqual(uiState.launchFlow.roomAckReceived, true);
  assert.strictEqual(uiState.launchFlow.lastError, '');

  launchFlow.clearLaunchFlow(uiState);
  assert.strictEqual(uiState.launchIntent, null);
  assert.strictEqual(uiState.launchIntentConsumed, false);
  assert.strictEqual(uiState.launchFlow.originalIntent, null);
  assert.strictEqual(uiState.launchFlow.retryCount, 0);

  console.log('connection-launch-flow module tests passed');
}

main();
