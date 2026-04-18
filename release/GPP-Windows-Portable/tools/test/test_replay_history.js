const assert = require('assert');

const replayHistory = require('../../src/client/js/replay-history');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function makeReplay(seed, startedAt, winnerId = 'P1') {
  return {
    replayId: `r:${seed}:${startedAt}`,
    version: 'ReplayV2',
    engineMode: 'pure',
    seed: String(seed),
    roomMeta: {
      roomCode: '1234',
      startedAt,
      startingAttacker: 0,
      endedAt: startedAt + 1000,
    },
    playersLoadout: [
      { playerId: 'P1', name: 'A', characterId: 'liuying', auroraDiceId: 'prime' },
      { playerId: 'P2', name: 'B', characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
    actions: [{ step: 1, actionCode: 'roll_attack', actor: 'P1' }],
    stepDetails: [{ step: 1, actionOutcome: { ok: true } }],
    snapshots: [{ step: 0 }, { step: 1 }],
    result: {
      winnerPlayerId: winnerId,
      rounds: 3,
      endedReason: 'normal_end',
      endedAt: startedAt + 2000,
    },
  };
}

function main() {
  const storage = createMemoryStorage();
  replayHistory.clearHistory(storage);

  const replayWithoutVersion = makeReplay('legacy', 9000);
  delete replayWithoutVersion.version;
  const migratedLegacy = replayHistory.validateReplay(replayWithoutVersion);
  assert.strictEqual(migratedLegacy.ok, true, 'missing version should migrate to ReplayV2');
  assert.strictEqual(migratedLegacy.replay.version, 'ReplayV2');

  const replayWithUnknownVersion = makeReplay('future', 9001);
  replayWithUnknownVersion.version = 'ReplayV99';
  const unsupported = replayHistory.validateReplay(replayWithUnknownVersion);
  assert.strictEqual(unsupported.ok, false, 'unknown version should be rejected');
  assert.strictEqual(unsupported.errorCode, 'UNSUPPORTED_REPLAY_VERSION');
  assert.strictEqual(
    replayHistory.upsertReplay(replayWithUnknownVersion, { storage, savedAt: 9001 }),
    null,
    'upsert should reject unsupported versions',
  );

  for (let i = 0; i < 12; i += 1) {
    replayHistory.upsertReplay(makeReplay(`seed_${i}`, 1000 + i), { storage, savedAt: 10000 + i });
  }

  let history = replayHistory.loadHistory(storage);
  assert.strictEqual(history.length, 10, 'history should keep latest 10 entries');
  assert.strictEqual(history[0].replay.seed, 'seed_11');
  assert.strictEqual(history[9].replay.seed, 'seed_2');

  const duplicateReplay = makeReplay('seed_11', 1011, 'P2');
  replayHistory.upsertReplay(duplicateReplay, { storage, savedAt: 20000 });
  history = replayHistory.loadHistory(storage);
  assert.strictEqual(history.length, 10, 'duplicate upsert should not grow list');
  assert.strictEqual(history[0].summary.winner, 'B');

  replayHistory.removeReplayById('r:seed_11:1011', storage);
  history = replayHistory.loadHistory(storage);
  assert.strictEqual(history.length, 9, 'remove should delete one entry');

  replayHistory.clearHistory(storage);
  history = replayHistory.loadHistory(storage);
  assert.strictEqual(history.length, 0, 'clear should remove all entries');

  const storagePayload = [
    { savedAt: 1, replay: makeReplay('ok', 2001) },
    { savedAt: 2, replay: Object.assign(makeReplay('bad', 2002), { version: 'ReplayV9' }) },
  ];
  storage.setItem(replayHistory.STORAGE_KEY, JSON.stringify(storagePayload));
  history = replayHistory.loadHistory(storage);
  assert.strictEqual(history.length, 1, 'loadHistory should filter unsupported replay versions');
  const loadErrors = replayHistory.getLastLoadErrors();
  assert(loadErrors.some((error) => error && error.errorCode === 'UNSUPPORTED_REPLAY_VERSION'));

  console.log('replay-history tests passed');
}

main();

