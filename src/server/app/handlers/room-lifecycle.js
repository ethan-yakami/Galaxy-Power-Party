const {
  send,
  newRoomCode,
  getPlayerRoom,
  getPlayerById,
  readyToStart,
  createNewRoomPlayer,
  isHumanPlayer,
  isReservedHumanPlayer,
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
  deserializeState,
  applyActionInPlace,
  encodeAction,
  OPCODES,
} = require('../../../core/battle-engine');
const { hashSeed, nextInt } = require('../../../core/battle-engine/rng');
const replaySchema = require('../../../core/shared/replay-schema');
const { CharacterRegistry, allowsNoAurora } = require('../../services/registry');
const {
  createReplayV1,
  appendReplaySnapshot,
} = require('../../services/replay');
const { sendError, ERROR_CODES } = require('../../transport/protocol/errors');
const { createLogger } = require('../../observability/logger');

function normalizeResumeMode(mode) {
  const value = typeof mode === 'string' ? mode.trim() : '';
  if (value === 'resume_room') return 'resume_room';
  if (value === 'resume_local') return 'resume_local';
  if (value === 'replay') return 'resume_local';
  return 'resume_room';
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePlayerLoadout(loadout, fallback) {
  const next = isPlainObject(loadout) ? loadout : {};
  const fallbackValue = isPlainObject(fallback) ? fallback : {};
  const characterId = typeof next.characterId === 'string' && next.characterId
    ? next.characterId
    : fallbackValue.characterId;
  const character = CharacterRegistry[characterId];
  const allowsEmptyAurora = allowsNoAurora(character);
  const auroraDiceId = allowsEmptyAurora
    ? null
    : ((typeof next.auroraDiceId === 'string' && next.auroraDiceId)
      ? next.auroraDiceId
      : fallbackValue.auroraDiceId);
  return {
    characterId,
    auroraDiceId: auroraDiceId || null,
    name: typeof next.name === 'string' && next.name ? next.name : (fallbackValue.name || ''),
  };
}

function deriveResumeLoadouts(replay, state) {
  const stateLoadouts = [0, 1].map((idx) => {
    const character = state.catalog.characters[state.characterIndex[idx]];
    const aurora = state.catalog.auroras[state.auroraIndex[idx]];
    return {
      characterId: character && character.id ? character.id : '',
      auroraDiceId: aurora && aurora.id ? aurora.id : null,
      name: '',
    };
  });

  const replayLoadouts = Array.isArray(replay.playersLoadout) ? replay.playersLoadout : [];
  return [0, 1].map((idx) => normalizePlayerLoadout(replayLoadouts[idx], stateLoadouts[idx]));
}

function resolveResumeDraft(payload) {
  if (!payload || !isPlainObject(payload.replay)) {
    return { ok: false, reason: 'missing_replay' };
  }
  const migrated = replaySchema.migrateReplay(payload.replay.version, payload.replay);
  if (!migrated || migrated.ok !== true || !isPlainObject(migrated.replay)) {
    return { ok: false, reason: 'invalid_replay' };
  }

  const replay = migrated.replay;
  const snapshots = Array.isArray(replay.snapshots) ? replay.snapshots : [];
  if (!snapshots.length) {
    return { ok: false, reason: 'missing_snapshot' };
  }

  const requestedIndex = Number.isInteger(payload.snapshotIndex)
    ? payload.snapshotIndex
    : (snapshots.length - 1);
  const snapshotIndex = Math.max(0, Math.min(requestedIndex, snapshots.length - 1));
  const snapshot = snapshots[snapshotIndex];
  if (!snapshot || !isPlainObject(snapshot.state)) {
    return { ok: false, reason: 'invalid_snapshot_state' };
  }

  let state;
  try {
    state = deserializeState(snapshot.state);
  } catch (error) {
    return {
      ok: false,
      reason: 'state_deserialize_failed',
      error: error && error.message ? error.message : String(error),
    };
  }

  return {
    ok: true,
    replay,
    snapshot,
    snapshotIndex,
    state,
    loadouts: deriveResumeLoadouts(replay, state),
  };
}

function createRoomLifecycleHandlers({ rooms, shared, platform }) {
  const logger = createLogger('server.room-lifecycle');
  const OFFLINE_GRACE_MS = Number.isInteger(Number(process.env.GPP_PLAYER_OFFLINE_GRACE_MS))
    ? Number(process.env.GPP_PLAYER_OFFLINE_GRACE_MS)
    : 2 * 60 * 1000;

  function summarizeRoom(room) {
    if (!room) return null;
    return {
      code: room.code,
      status: room.status,
      roomMode: room.roomMode || 'standard',
      playerCount: Array.isArray(room.players) ? room.players.length : 0,
    };
  }

  function getReservedHumanPlayers(room, now = Date.now()) {
    const players = Array.isArray(room && room.players) ? room.players : [];
    return players.filter((player) => isReservedHumanPlayer(player, now));
  }

  function rejectJoinRoom(ws, reason) {
    const normalized = String(reason || '').trim();
    if (normalized === 'in_game') {
      sendError(ws, ERROR_CODES.ROOM_IN_GAME, '房间已经开打，当前无法加入。');
      return;
    }
    if (normalized === 'ended') {
      sendError(ws, ERROR_CODES.ROOM_ENDED, '房间已结束，请重新创建或加入其他房间。');
      return;
    }
    if (normalized === 'room_full') {
      sendError(ws, ERROR_CODES.ROOM_FULL, '房间已满，请换个房间或稍后再试。');
      return;
    }
    if (normalized === 'reserved_slot') {
      sendError(ws, ERROR_CODES.ROOM_RESERVED, '房主或玩家正在重连，请稍后再试。');
      return;
    }
    sendError(ws, ERROR_CODES.ROOM_NOT_FOUND, '房间不存在，可能已失效或离线保留时间已结束。');
  }

  function applyLoadoutToPlayer(player, loadout) {
    if (!player || !loadout) return;
    player.characterId = loadout.characterId || null;
    const character = CharacterRegistry[player.characterId];
    if (allowsNoAurora(character)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = !!player.characterId;
      return;
    }
    player.auroraDiceId = loadout.auroraDiceId || null;
    player.auroraSelectionConfirmed = !!(player.characterId && player.auroraDiceId);
  }

  function createRoomEngineUi(room, logs) {
    return {
      indexToPlayerId: [room.players[0].id, room.players[1].id],
      playerIdToIndex: {
        [room.players[0].id]: 0,
        [room.players[1].id]: 1,
      },
      logs: Array.isArray(logs) && logs.length ? logs.slice(-40) : ['游戏开始！'],
      effectEvents: [],
      actionBuffer: new Uint16Array(256),
      attackPreviewMask: 0,
      defensePreviewMask: 0,
    };
  }

  function createResumeBattleState(room, draft) {
    room.status = 'in_game';
    room.turnId = 0;
    room.battleSeed = typeof draft.replay.seed === 'string' && draft.replay.seed
      ? draft.replay.seed
      : `${room.code}:${Date.now()}:resume`;
    room.engineState = deserializeState(draft.snapshot.state);
    room.engineUi = createRoomEngineUi(room, draft.snapshot.view && draft.snapshot.view.logTail);
    if (room.engineState.phase === 2) {
      applyActionInPlace(room.engineState, encodeAction(OPCODES.ROLL_DEFENSE, 0), shared.buildRuntime(room));
    }
    buildPendingActionSet(room);
    room.game = projectStateToLegacyRoom(room.engineState, room.engineUi, {
      pendingAction: shared.buildPendingBattleAction(room),
    });
    room.replay = createReplayV1(room, {
      seed: room.battleSeed,
      startingAttacker: room.engineState.attacker,
      roomMode: room.roomMode,
      protocolModel: 'action_ticket',
      resumedFromReplayId: draft.replay.replayId || null,
      resumedFromStep: draft.snapshot.step,
    });
    appendReplaySnapshot(room, room.replay, 'resumed_state', 0);
    room.resumeDraft = null;
    room.pendingResumeOpponentLoadout = null;
  }

  function startGameIfReady(room) {
    const check = readyToStart(room);
    if (!check.ok) return;

    if (room.resumeDraft && room.resumeDraft.snapshot && room.resumeDraft.replay) {
      createResumeBattleState(room, room.resumeDraft);
      shared.getBroadcastRoom(room);
      return;
    }

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
    room.engineUi = createRoomEngineUi(room);
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
      roomMode: 'standard',
      isPublic: true,
    };

    rooms.set(code, room);
    ws.playerRoomCode = code;
    logger.info('room_created', {
      room: summarizeRoom(room),
      creatorPlayerId: ws.playerId,
      roomType: 'standard',
    });
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
      roomMode: 'ai',
      isPublic: false,
    };

    rooms.set(code, room);
    ws.playerRoomCode = code;
    logger.info('room_created', {
      room: summarizeRoom(room),
      creatorPlayerId: ws.playerId,
      roomType: 'ai',
    });
    shared.getBroadcastRoom(room);
  }

  function handleJoinRoom(ws, payload) {
    const { code, name } = payload || {};
    const room = rooms.get(String(code || '').trim());
    if (!room) {
      logger.warn('room_join_rejected', {
        roomCode: String(code || '').trim(),
        playerId: ws.playerId,
        reason: 'not_found',
      });
      rejectJoinRoom(ws, 'not_found');
      return;
    }
    if (room.status === 'ended') {
      logger.warn('room_join_rejected', {
        roomCode: room.code,
        playerId: ws.playerId,
        reason: 'ended',
      });
      rejectJoinRoom(ws, 'ended');
      return;
    }
    if (room.status !== 'lobby') {
      logger.warn('room_join_rejected', {
        roomCode: room.code,
        playerId: ws.playerId,
        reason: 'in_game',
      });
      rejectJoinRoom(ws, 'in_game');
      return;
    }
    if (getReservedHumanPlayers(room).length > 0) {
      logger.warn('room_join_rejected', {
        roomCode: room.code,
        playerId: ws.playerId,
        reason: 'reserved_slot',
        reservedPlayers: getReservedHumanPlayers(room).map((player) => ({
          playerId: player.id,
          graceDeadline: player.graceDeadline || null,
        })),
      });
      rejectJoinRoom(ws, 'reserved_slot');
      return;
    }
    if (room.players.length >= 2) {
      logger.warn('room_join_rejected', {
        roomCode: room.code,
        playerId: ws.playerId,
        reason: 'room_full',
      });
      rejectJoinRoom(ws, 'room_full');
      return;
    }

    const player = createNewRoomPlayer(ws, name || '玩家');
    if (room.resumeDraft && room.pendingResumeOpponentLoadout) {
      applyLoadoutToPlayer(player, room.pendingResumeOpponentLoadout);
      room.pendingResumeOpponentLoadout = null;
    }

    room.players.push(player);
    room.lastActiveAt = Date.now();
    ws.playerRoomCode = room.code;
    logger.info('room_joined', {
      room: summarizeRoom(room),
      playerId: ws.playerId,
    });
    shared.getBroadcastRoom(room);

    if (room.resumeDraft) {
      startGameIfReady(room);
    }
  }

  function handleAuthenticate(ws, payload) {
    const accessToken = payload && typeof payload.accessToken === 'string'
      ? payload.accessToken.trim()
      : '';
    if (!accessToken) {
      ws.authUser = null;
      ws.authSessionId = null;
      send(ws, {
        type: 'auth_state',
        ok: false,
        reason: 'missing_access_token',
      });
      return;
    }
    if (!platform || typeof platform.authenticateAccessToken !== 'function') {
      send(ws, {
        type: 'auth_state',
        ok: false,
        reason: 'auth_unavailable',
      });
      return;
    }

    Promise.resolve(platform.authenticateAccessToken(accessToken))
      .then((auth) => {
        if (!auth || auth.ok !== true) {
          ws.authUser = null;
          ws.authSessionId = null;
          send(ws, {
            type: 'auth_state',
            ok: false,
            reason: auth && auth.reason ? auth.reason : 'invalid_access_token',
          });
          return;
        }
        ws.authUser = auth.profile;
        ws.authSessionId = auth.session.id;
        const room = getPlayerRoom(ws, rooms);
        const player = room ? getPlayerById(room, ws.playerId) : null;
        if (player) {
          player.userId = auth.profile && auth.profile.id ? auth.profile.id : null;
        }
        send(ws, {
          type: 'auth_state',
          ok: true,
          user: auth.profile,
        });
      })
      .catch(() => {
        ws.authUser = null;
        ws.authSessionId = null;
        send(ws, {
          type: 'auth_state',
          ok: false,
          reason: 'auth_internal_error',
        });
      });
  }

  function handleResumeSession(ws, payload) {
    const { roomCode, reconnectToken } = payload || {};
    const room = rooms.get(String(roomCode || '').trim());
    if (!room) {
      logger.warn('session_resume_failed', {
        roomCode: String(roomCode || '').trim(),
        playerId: ws.playerId,
        reason: 'room_not_found',
      });
      send(ws, { type: 'session_resume_failed', reason: 'room_not_found' });
      return;
    }

    const player = room.players.find((candidate) => candidate.reconnectToken === reconnectToken);
    if (!player) {
      logger.warn('session_resume_failed', {
        roomCode: room.code,
        playerId: ws.playerId,
        reason: 'invalid_token',
      });
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
    room.lastActiveAt = Date.now();

    send(ws, {
      type: 'session_resumed',
      playerId: player.id,
      roomCode: room.code,
    });
    logger.info('session_resumed', {
      room: summarizeRoom(room),
      playerId: player.id,
      userId: player.userId || null,
    });
    shared.getBroadcastRoom(room);
  }

  function handleCreateResumeRoom(ws, payload) {
    const { name } = payload || {};
    const mode = normalizeResumeMode(payload && payload.mode);
    const resolved = resolveResumeDraft(payload);
    if (!resolved.ok) {
      send(ws, {
        type: 'error',
        message: `恢复房间失败：${resolved.reason}${resolved.error ? ` (${resolved.error})` : ''}`,
      });
      return;
    }

    const code = newRoomCode(rooms);
    const player = createNewRoomPlayer(ws, name || '继续玩家');
    applyLoadoutToPlayer(player, resolved.loadouts[0]);

    const room = {
      code,
      status: 'lobby',
      roomMode: mode,
      players: [player],
      game: null,
      lastActiveAt: Date.now(),
      engineMode: 'pure',
      isPublic: mode === 'resume_room',
      resumeDraft: {
        replay: resolved.replay,
        snapshot: resolved.snapshot,
        snapshotIndex: resolved.snapshotIndex,
      },
      pendingResumeOpponentLoadout: resolved.loadouts[1],
    };

    if (mode === 'resume_local') {
      const aiPlayer = createAIPlayer(code);
      const aiLoadout = resolved.loadouts[1];
      if (aiLoadout && aiLoadout.name) {
        aiPlayer.name = aiLoadout.name;
      }
      applyLoadoutToPlayer(aiPlayer, aiLoadout);
      aiPlayer.auroraSelectionConfirmed = true;
      room.players.push(aiPlayer);
    }

    rooms.set(code, room);
    ws.playerRoomCode = code;
    logger.info('room_created', {
      room: summarizeRoom(room),
      creatorPlayerId: ws.playerId,
      roomType: mode,
    });

    if (mode === 'resume_local') {
      startGameIfReady(room);
      if (room.status !== 'in_game') {
        shared.getBroadcastRoom(room);
      }
      return;
    }

    shared.getBroadcastRoom(room);
  }

  function leaveRoom(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;

    clearAIActionTimer(room);
    room.players = room.players.filter((player) => player.ws !== ws);
    ws.playerRoomCode = null;

    const hasHumanPlayers = room.players.some((player) => isHumanPlayer(player));
    if (room.players.length === 0 || !hasHumanPlayers) {
      rooms.delete(room.code);
      return;
    }

    room.lastActiveAt = Date.now();
    shared.getBroadcastRoom(room);
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
    room.resumeDraft = null;
    room.pendingResumeOpponentLoadout = null;

    for (const player of room.players) {
      if (player.ws && player.ws.isAI) {
        reRandomizeAIPlayer(player);
        player.auroraSelectionConfirmed = true;
      } else {
        player.auroraSelectionConfirmed = false;
      }
    }

    room.lastActiveAt = Date.now();
    shared.getBroadcastRoom(room);
  }

  function handleDisbandRoom(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    clearAIActionTimer(room);
    rooms.delete(room.code);
    for (const player of room.players) {
      if (player.ws) {
        player.ws.playerRoomCode = null;
        send(player.ws, { type: 'left_room', reason: '房主已解散房间。' });
      }
    }
    logger.info('room_disbanded', {
      room: summarizeRoom(room),
      actorPlayerId: ws.playerId,
    });
  }

  function handleSocketClosed(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    clearAIActionTimer(room);
    player.isOnline = false;
    player.disconnectedAt = Date.now();
    player.graceDeadline = player.disconnectedAt + OFFLINE_GRACE_MS;
    player.ws = null;
    room.lastActiveAt = Date.now();

    const humanPlayers = room.players.filter((candidate) => isHumanPlayer(candidate));
    const allHumansOffline = humanPlayers.length > 0
      && humanPlayers.every((candidate) => candidate.isOnline === false || !candidate.ws);

    logger.info('player_marked_offline', {
      room: summarizeRoom(room),
      playerId: player.id,
      graceDeadline: player.graceDeadline,
      allHumansOffline,
    });

    if (!allHumansOffline) {
      shared.getBroadcastRoom(room);
    }
  }

  return {
    startGameIfReady,
    handlers: {
      handleCreateRoom,
      handleCreateAIRoom,
      handleJoinRoom,
      handleAuthenticate,
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
