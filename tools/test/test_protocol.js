const assert = require('assert');
const { normalizeIncomingMessage } = require('../../src/server/transport/protocol/messages');
const { buildErrorPayload, ERROR_CODES } = require('../../src/server/transport/protocol/errors');
const { getErrorDescriptor } = require('../../src/core/shared/protocol/error-registry');

function testLegacyMessageNormalization() {
  const input = JSON.stringify({
    type: 'join_room',
    name: 'Alice',
    code: '1234',
  });
  const result = normalizeIncomingMessage(input);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.envelope.type, 'join_room');
  assert.deepStrictEqual(result.envelope.payload, { name: 'Alice', code: '1234' });
  assert.strictEqual(result.legacyMessage.name, 'Alice');
  assert.strictEqual(result.legacyMessage.code, '1234');
}

function testNewEnvelopeMessageNormalization() {
  const input = JSON.stringify({
    type: 'join_room',
    payload: { name: 'Bob', code: '5678' },
    meta: { requestId: 'req-1', protocolVersion: '2' },
  });
  const result = normalizeIncomingMessage(input);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.envelope.type, 'join_room');
  assert.deepStrictEqual(result.envelope.payload, { name: 'Bob', code: '5678' });
  assert.strictEqual(result.envelope.meta.requestId, 'req-1');
  assert.strictEqual(result.envelope.meta.protocolVersion, '2');
}

function testUnsupportedProtocolVersion() {
  const input = JSON.stringify({
    type: 'join_room',
    payload: { name: 'Bob', code: '5678' },
    meta: { requestId: 'req-unsupported', protocolVersion: '999' },
  });
  const result = normalizeIncomingMessage(input);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION);
  assert.strictEqual(result.meta.requestId, 'req-unsupported');
}

function testJoinRoomNumericCodeAndExtraFields() {
  const input = JSON.stringify({
    type: 'join_room',
    payload: {
      name: 'Carol',
      code: 4321,
      extraField: 'kept for loose validation',
    },
  });
  const result = normalizeIncomingMessage(input);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.envelope.payload.code, 4321);
  assert.strictEqual(result.envelope.payload.extraField, 'kept for loose validation');
}

function testInvalidJson() {
  const result = normalizeIncomingMessage('{');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.INVALID_JSON);
}

function testUnknownType() {
  const result = normalizeIncomingMessage(JSON.stringify({ payload: { a: 1 } }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.UNKNOWN_TYPE);
}

function testInvalidPayloadCreateRoom() {
  const result = normalizeIncomingMessage(JSON.stringify({
    type: 'create_room',
    payload: { name: 123 },
    meta: { requestId: 'req-payload-1' },
  }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.INVALID_PAYLOAD);
  assert.strictEqual(result.meta.requestId, 'req-payload-1');
}

function testInvalidPayloadResumeSessionMissingFields() {
  const result = normalizeIncomingMessage(JSON.stringify({
    type: 'resume_session',
    payload: { reconnectToken: 'token-only' },
  }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testInvalidPayloadIndices() {
  const result = normalizeIncomingMessage(JSON.stringify({
    type: 'confirm_attack_selection',
    payload: { indices: [0, 1.5, 2] },
  }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testInvalidPayloadExportReplayRequestSource() {
  const result = normalizeIncomingMessage(JSON.stringify({
    type: 'export_replay',
    payload: { requestSource: 10 },
  }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testSubmitBattleActionPayload() {
  const okResult = normalizeIncomingMessage(JSON.stringify({
    type: 'submit_battle_action',
    payload: { turnId: 3, actionId: '3:1:64' },
  }));
  assert.strictEqual(okResult.ok, true);

  const badResult = normalizeIncomingMessage(JSON.stringify({
    type: 'submit_battle_action',
    payload: { turnId: '3', actionId: '' },
  }));
  assert.strictEqual(badResult.ok, false);
  assert.strictEqual(badResult.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testCreateResumeRoomPayload() {
  const okResult = normalizeIncomingMessage(JSON.stringify({
    type: 'create_resume_room',
    payload: {
      mode: 'resume_room',
      snapshotIndex: 3,
      replay: { replayId: 'r1', version: 'ReplayV2' },
    },
  }));
  assert.strictEqual(okResult.ok, true);

  const badResult = normalizeIncomingMessage(JSON.stringify({
    type: 'create_resume_room',
    payload: { snapshotIndex: '3' },
  }));
  assert.strictEqual(badResult.ok, false);
  assert.strictEqual(badResult.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testAuthenticatePayload() {
  const okResult = normalizeIncomingMessage(JSON.stringify({
    type: 'authenticate',
    payload: { accessToken: 'access-token-1' },
  }));
  assert.strictEqual(okResult.ok, true);
  assert.strictEqual(okResult.envelope.payload.accessToken, 'access-token-1');

  const badResult = normalizeIncomingMessage(JSON.stringify({
    type: 'authenticate',
    payload: {},
  }));
  assert.strictEqual(badResult.ok, false);
  assert.strictEqual(badResult.errorCode, ERROR_CODES.INVALID_PAYLOAD);
}

function testErrorPayload() {
  const payload = buildErrorPayload(ERROR_CODES.INVALID_SELECTION, 'Invalid selection.', {
    meta: { requestId: 'req-2', protocolVersion: '2' },
  });
  assert.strictEqual(payload.type, 'error');
  assert.strictEqual(payload.code, ERROR_CODES.INVALID_SELECTION);
  assert.strictEqual(payload.message, 'Invalid selection.');
  assert.strictEqual(payload.severity, 'warn');
  assert.strictEqual(payload.category, 'user');
  assert.strictEqual(payload.meta.requestId, 'req-2');
}

function testDefaultInvalidPayloadMessage() {
  const payload = buildErrorPayload(ERROR_CODES.INVALID_PAYLOAD);
  assert.strictEqual(payload.code, ERROR_CODES.INVALID_PAYLOAD);
  const descriptor = getErrorDescriptor(ERROR_CODES.INVALID_PAYLOAD);
  assert.strictEqual(payload.message, descriptor.defaultMessage);
}

function run() {
  testLegacyMessageNormalization();
  testNewEnvelopeMessageNormalization();
  testUnsupportedProtocolVersion();
  testJoinRoomNumericCodeAndExtraFields();
  testInvalidJson();
  testUnknownType();
  testInvalidPayloadCreateRoom();
  testInvalidPayloadResumeSessionMissingFields();
  testInvalidPayloadIndices();
  testInvalidPayloadExportReplayRequestSource();
  testSubmitBattleActionPayload();
  testCreateResumeRoomPayload();
  testAuthenticatePayload();
  testErrorPayload();
  testDefaultInvalidPayloadMessage();
  console.log('test_protocol passed');
}

run();

