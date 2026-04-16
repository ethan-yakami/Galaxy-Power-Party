const assert = require('assert');
const fs = require('fs');
const path = require('path');

const manifest = require('../../src/core/shared/generated/protocol-manifest.json');
const { MESSAGE_SCHEMA } = require('../../src/core/shared/protocol/schema');
const { listErrorDescriptors } = require('../../src/core/shared/protocol/error-registry');

function findMessage(type) {
  return (manifest.messages || []).find((item) => item && item.type === type) || null;
}

function testProtoManifestMetadata() {
  assert.strictEqual(manifest.source.kind, 'proto');
  assert.deepStrictEqual(manifest.source.files, [
    'proto/auth.proto',
    'proto/battle.proto',
    'proto/envelope.proto',
    'proto/errors.proto',
    'proto/replay.proto',
    'proto/room.proto',
  ]);
}

function testHighValueStructuredPayloads() {
  const battleActions = findMessage('battle_actions');
  const resumeRoom = findMessage('create_resume_room');
  const replayExport = findMessage('replay_export');

  assert.ok(battleActions);
  assert.ok(resumeRoom);
  assert.ok(replayExport);

  assert.strictEqual(battleActions.fields.find((field) => field.name === 'actions').type, 'object_array');
  assert.strictEqual(resumeRoom.fields.find((field) => field.name === 'replay').type, 'object');
  assert.strictEqual(replayExport.fields.find((field) => field.name === 'content').type, 'object');
}

function testSchemaTracksGeneratedManifest() {
  assert.strictEqual(MESSAGE_SCHEMA.length, manifest.messages.length);
  const welcome = MESSAGE_SCHEMA.find((item) => item.type === 'welcome');
  assert.ok(welcome);
  assert.ok(welcome.fields.some((field) => field.name === 'meta' && field.type === 'object'));
}

function testGeneratedTypesContainMessageUnion() {
  const dtsPath = path.join(__dirname, '../../src/core/shared/generated/protocol-types.d.ts');
  const content = fs.readFileSync(dtsPath, 'utf8');
  assert.ok(content.includes("export type ProtocolMessageType ="));
  assert.ok(content.includes("'welcome'"));
  assert.ok(content.includes("'submit_battle_action'"));
}

function testErrorCatalogShape() {
  const errors = listErrorDescriptors();
  assert.ok(Array.isArray(errors));
  assert.ok(errors.some((item) => item.code === 'UNSUPPORTED_PROTOCOL_VERSION' && item.severity === 'error'));
  assert.ok(errors.some((item) => item.code === 'BATTLE_INVALID_ACTION' && item.category === 'battle'));
}

function run() {
  testProtoManifestMetadata();
  testHighValueStructuredPayloads();
  testSchemaTracksGeneratedManifest();
  testGeneratedTypesContainMessageUnion();
  testErrorCatalogShape();
  console.log('test_protocol_contracts passed');
}

run();
