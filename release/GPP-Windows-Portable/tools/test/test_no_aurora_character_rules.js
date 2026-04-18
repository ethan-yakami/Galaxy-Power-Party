const assert = require('assert');

const replaySchema = require('../../src/core/shared/replay-schema');
const { createBattle, serializeState } = require('../../src/core/battle-engine');
const {
  CharacterRegistry,
  allowsNoAurora,
} = require('../../src/server/services/registry');
const createLobbyHandlers = require('../../src/server/app/handlers/lobby');
const createRoomLifecycleHandlers = require('../../src/server/app/handlers/room-lifecycle');

function testRegistryMarksRobinAsNoAurora() {
  const robin = CharacterRegistry.zhigengniao;
  assert.ok(robin, 'zhigengniao should exist in registry');
  assert.strictEqual(robin.allowsNoAurora, true);
  assert.strictEqual(allowsNoAurora(robin), true);
}

function testLobbyRejectsAuroraPickForRobin() {
  const ws = { playerId: 'P1', playerRoomCode: '9001' };
  const player = {
    id: 'P1',
    ws,
    name: 'Tester',
    characterId: 'zhigengniao',
    auroraDiceId: null,
    auroraSelectionConfirmed: true,
  };
  const room = {
    code: '9001',
    players: [player],
  };
  const rooms = new Map([[room.code, room]]);

  let broadcastCount = 0;
  let readyChecks = 0;
  const handlers = createLobbyHandlers({
    rooms,
    shared: {
      getBroadcastRoom() {
        broadcastCount += 1;
      },
    },
    startGameIfReady() {
      readyChecks += 1;
    },
  });

  handlers.handleChooseAurora(ws, { auroraDiceId: 'destiny' });

  assert.strictEqual(player.auroraDiceId, null, 'zhigengniao should stay unequipped');
  assert.strictEqual(player.auroraSelectionConfirmed, true, 'zhigengniao should remain ready without aurora');
  assert.strictEqual(broadcastCount, 1, 'lobby should rebroadcast after blocked selection');
  assert.strictEqual(readyChecks, 1, 'readiness should be rechecked after blocked selection');
}

function testResumeRoomStripsAuroraFromRobin() {
  const ws = {
    playerId: 'P1',
    reconnectToken: 'token-1',
  };
  const rooms = new Map();
  const shared = {
    getBroadcastRoom() {},
    buildPendingBattleAction() {
      return null;
    },
    buildRuntime() {
      return {
        log() {},
      };
    },
  };
  const lifecycle = createRoomLifecycleHandlers({ rooms, shared });

  const state = createBattle({
    players: [
      { characterId: 'zhigengniao', auroraDiceId: null },
      { characterId: 'baie', auroraDiceId: 'legacy' },
    ],
  }, 'resume-seed', {
    startingAttacker: 0,
  });

  lifecycle.handlers.handleCreateResumeRoom(ws, {
    name: 'Tester',
    mode: 'resume_room',
    replay: {
      replayId: 'resume-test',
      version: replaySchema.REPLAY_VERSION,
      engineMode: 'pure',
      protocolModel: 'action_ticket',
      seed: 'resume-seed',
      roomMeta: {
        roomCode: 'replay-room',
        startedAt: Date.now(),
        startingAttacker: 0,
        endedAt: null,
        resumedFromReplayId: null,
        resumedFromStep: null,
        roomMode: 'resume_room',
      },
      playersLoadout: [
        { playerId: 'P1', name: 'Robin', characterId: 'zhigengniao', auroraDiceId: 'destiny' },
        { playerId: 'P2', name: 'Enemy', characterId: 'baie', auroraDiceId: 'legacy' },
      ],
      actions: [],
      stepDetails: [],
      snapshots: [
        {
          step: 0,
          reason: 'snapshot',
          timestamp: Date.now(),
          round: 1,
          phase: 'attack_roll',
          status: 'in_game',
          winnerPlayerId: null,
          state: serializeState(state),
          view: { logTail: [] },
        },
      ],
      result: {
        winnerPlayerId: null,
        rounds: 1,
        endedReason: '',
        endedAt: null,
      },
    },
  });

  const room = Array.from(rooms.values())[0];
  assert.ok(room, 'resume room should be created');
  assert.strictEqual(room.players[0].characterId, 'zhigengniao');
  assert.strictEqual(room.players[0].auroraDiceId, null, 'resume loadout should strip aurora from zhigengniao');
  assert.strictEqual(room.players[0].auroraSelectionConfirmed, true, 'zhigengniao should remain confirmed after resume');
}

function main() {
  testRegistryMarksRobinAsNoAurora();
  testLobbyRejectsAuroraPickForRobin();
  testResumeRoomStripsAuroraFromRobin();
  console.log('no-aurora-character rules test passed');
}

main();
