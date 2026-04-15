const {
  send,
  newRoomCode,
  getPlayerRoom,
  getPlayerById,
  readyToStart,
  createNewRoomPlayer,
} = require('../../services/rooms');
const {
  createAIPlayer,
  clearAIActionTimer,
  reRandomizeAIPlayer,
} = require('../../ai');
const { buildPendingActionSet, clearPendingActionSet } = require('../../services/battle-actions');
const {
  createBattle,
  projectStateToLegacyRoom,
} = require('../../../core/battle-engine');
const { hashSeed, nextInt } = require('../../../core/battle-engine/rng');
const {
  createReplayV1,
  appendReplaySnapshot,
  finalizeReplay,
} = require('../../services/replay');

function createRoomLifecycleHandlers({ rooms, shared }) {
  function startGameIfReady(room) {
    const check = readyToStart(room);
    if (!check.ok) return;

    const battleSeed = `${room.code}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const attackerRng = { rngState: hashSeed(battleSeed) };
    const startingAttacker = nextInt(attackerRng, 2);
    room.status = 'in_game';
    room.battleSeed = battleSeed;
    room.turnId = 0;
    room.engineState = createBattle({
      players: [
        { characterId: room.players[0].characterId, auroraDiceId: room.players[0].auroraDiceId },
        { characterId: room.players[1].characterId, auroraDiceId: room.players[1].auroraDiceId },
      ],
    }, battleSeed, {
      startingAttacker,
    });
    room.engineUi = {
      indexToPlayerId: [room.players[0].id, room.players[1].id],
      playerIdToIndex: {
        [room.players[0].id]: 0,
        [room.players[1].id]: 1,
      },
      logs: ['游戏开始！'],
      effectEvents: [],
      actionBuffer: new Uint16Array(256),
      attackPreviewMask: 0,
      defensePreviewMask: 0,
    };
    buildPendingActionSet(room);
    room.game = projectStateToLegacyRoom(room.engineState, room.engineUi, {
      pendingAction: shared.buildPendingBattleAction(room),
    });
    room.replay = createReplayV1(room, {
      seed: battleSeed,
      startingAttacker,
      roomMode: room.roomMode,
      protocolModel: 'action_ticket',
    });
    appendReplaySnapshot(room, room.replay, 'initial_state', 0);
    shared.getBroadcastRoom(room);
  }

  function handleCreateRoom(ws, payload) {
    const { name } = payload || {};
    const code = newRoomCode(rooms);
    const player = createNewRoomPlayer(ws, name || '玩家');

    const room = {
      code,
      status: 'lobby',
      players: [player],
      game: null,
      lastActiveAt: Date.now(),
      engineMode: 'pure',
    };

    rooms.set(code, room);
    ws.playerRoomCode = code;
    shared.getBroadcastRoom(room);
  }

  function handleCreateAIRoom(ws, payload) {
    const { name } = payload || {};
    const code = newRoomCode(rooms);
    const player = createNewRoomPlayer(ws, name || '玩家');
    const aiPlayer = createAIPlayer(code);

    const room = {
      code,
      status: 'lobby',
      players: [player, aiPlayer],
      game: null,
      lastActiveAt: Date.now(),
      engineMode: 'pure',
    };

    rooms.set(code, room);
    ws.playerRoomCode = code;
    shared.getBroadcastRoom(room);
  }

  function handleJoinRoom(ws, payload) {
    const { code, name } = payload || {};
    const room = rooms.get(String(code || '').trim());
    if (!room) {
      send(ws, { type: 'error', message: '房间不存在。' });
      return;
    }
    if (room.players.length >= 2) {
      send(ws, { type: 'error', message: '房间已满。' });
      return;
    }

    const player = createNewRoomPlayer(ws, name || '玩家');
    room.players.push(player);
    ws.playerRoomCode = room.code;
    shared.getBroadcastRoom(room);
  }

  function handleResumeSession(ws, payload) {
    const { roomCode, reconnectToken } = payload || {};
    const room = rooms.get(String(roomCode || '').trim());
    if (!room) {
      send(ws, { type: 'session_resume_failed', reason: 'room_not_found' });
      return;
    }

    const player = room.players.find((p) => p.reconnectToken === reconnectToken);
    if (!player) {
      send(ws, { type: 'session_resume_failed', reason: 'invalid_token' });
      return;
    }

    player.ws = ws;
    player.isOnline = true;
    player.disconnectedAt = null;
    player.graceDeadline = null;
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }

    ws.playerId = player.id;
    ws.reconnectToken = player.reconnectToken;
    ws.playerRoomCode = room.code;

    send(ws, {
      type: 'session_resumed',
      playerId: player.id,
      roomCode: room.code,
    });
    shared.getBroadcastRoom(room);
  }

  function handleCreateResumeRoom(ws, payload) {
    const { name, characterId, auroraDiceId } = payload || {};
    const code = newRoomCode(rooms);
    const player = createNewRoomPlayer(ws, name || '玩家');
    player.characterId = characterId || 'xiadie';
    player.auroraDiceId = auroraDiceId || 'medic';
    player.auroraSelectionConfirmed = true;

    const room = {
      code,
      status: 'lobby',
      roomMode: 'resume_room',
      players: [player],
      game: null,
      lastActiveAt: Date.now(),
      engineMode: 'pure',
    };

    rooms.set(code, room);
    ws.playerRoomCode = code;
    shared.getBroadcastRoom(room);
  }

  function leaveRoom(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;

    clearAIActionTimer(room);
    room.players = room.players.filter((p) => p.ws !== ws);
    ws.playerRoomCode = null;

    if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      shared.getBroadcastRoom(room);
    }
  }

  function handlePlayAgain(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    clearAIActionTimer(room);
    room.game = null;
    room.engineState = null;
    room.engineUi = null;
    room.turnId = 0;
    clearPendingActionSet(room);
    room.status = 'lobby';

    for (const p of room.players) {
      if (p.ws && p.ws.isAI) {
        reRandomizeAIPlayer(p);
      }
    }

    shared.getBroadcastRoom(room);
  }

  function handleDisbandRoom(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    clearAIActionTimer(room);
    rooms.delete(room.code);
    for (const p of room.players) {
      if (p.ws) {
        p.ws.playerRoomCode = null;
        send(p.ws, { type: 'left_room', reason: '房主已解散房间。' });
      }
    }
  }

  function handleSocketClosed(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    clearAIActionTimer(room);
    player.isOnline = false;
    player.disconnectedAt = Date.now();
    player.ws = null;

    if (room.players.every((p) => !p.ws || p.ws.isAI)) {
      rooms.delete(room.code);
    } else {
      shared.getBroadcastRoom(room);
    }
  }

  return {
    startGameIfReady,
    handlers: {
      handleCreateRoom,
      handleCreateAIRoom,
      handleJoinRoom,
      handleResumeSession,
      handleCreateResumeRoom,
      leaveRoom,
      handlePlayAgain,
      handleDisbandRoom,
      handleSocketClosed,
    },
  };
}

module.exports = createRoomLifecycleHandlers;

