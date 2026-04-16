const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');

const { startServer } = require('../../src/server/app/bootstrap');
const { runCli: runProtocolInspect } = require('../../tools/dev/protocol_inspect');
const { runCli: runReplayInspect } = require('../../tools/dev/replay_inspect');
const { runCli: runDebugRoom } = require('../../tools/dev/debug_room');
const { runCli: runDataCheck } = require('../../tools/dev/data_check');

async function run() {
  const protocol = runProtocolInspect(['--type', 'welcome']);
  assert.strictEqual(protocol.exitCode, 0);
  assert.ok(protocol.payload.descriptor);

  const dataCheck = runDataCheck([]);
  assert.strictEqual(dataCheck.exitCode, 0);
  assert.strictEqual(dataCheck.payload.ok, true);

  const tmpReplayFile = path.join(os.tmpdir(), 'gpp-cli-replay.json');
  fs.writeFileSync(tmpReplayFile, JSON.stringify({
    replayId: 'cli-replay',
    seed: 'seed',
    playersLoadout: [],
    actions: [],
    snapshots: [],
    roomMeta: {},
    result: {},
  }), 'utf8');

  const replayInspect = runReplayInspect(['--file', tmpReplayFile]);
  assert.strictEqual(replayInspect.exitCode, 0);
  assert.strictEqual(replayInspect.payload.ok, true);

  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  try {
    const port = runtime.server.address().port;
    const debugRoom = await runDebugRoom([
      '--base-url',
      `http://127.0.0.1:${port}`,
    ]);
    assert.strictEqual(debugRoom.exitCode, 0);
    assert.strictEqual(debugRoom.payload.ok, true);
  } finally {
    runtime.wss.close();
    runtime.server.close();
  }

  console.log('test_tooling_cli passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
