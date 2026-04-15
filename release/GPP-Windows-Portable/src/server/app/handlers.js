const {
  CharacterRegistry,
  AuroraRegistry,
  allowsNoAurora,
  getCharacterSummary,
  getAuroraDiceSummary,
  listCustomVariants,
  upsertCustomVariant,
  removeCustomVariant,
  toggleCustomVariant,
} = require('../services/registry');
const {
  send,
  broadcastRoom,
  newRoomCode,
  getPlayerRoom,
  getPlayerById,
  readyToStart,
  createNewRoomPlayer,
} = require('../services/rooms');
const {
  createAIPlayer,
  scheduleAIAction,
  clearAIActionTimer,
  getPendingActionKind,
  getPendingActionLabel,
  getPendingActorId,
} = require('../ai');
const {
  createBattle,
  applyActionInPlace,
  projectStateToLegacyRoom,
  indicesToMask,
  OPCODES,
  createRuntime,
} = require('../../core/battle-engine');
const { hashSeed, nextInt } = require('../../core/battle-engine/rng');
const {
  createReplayV1,
  appendReplaySnapshot,
  recordPureActionReplay,
  finalizeReplay,
  exportReplay,
} = require('../services/replay');

module.exports = function createHandlers(rooms) {
  function buildPendingBattleAction(room) {
    if (!room || room.status !== 'in_game' || !room.engineState || !room.engineUi) return null;
    const actorId = getPendingActorId(room);
    const kind = getPendingActionKind(room);
    if (!actorId || !kind) return null;
    const actor = room.players.find((player) => player && player.id === actorId) || null;
    return {
      actorId,
      kind,
      label: getPendingActionLabel(kind),
      isAiThinking: !!(actor && actor.ws && actor.ws.isAI && room.aiAction && room.aiAction.actorId === actorId),
    };
  }

  function getBroadcastRoom(room) {
    const hasAI = room.players.some((p) => p.ws && p.ws.isAI);
    if (hasAI) {
      scheduleAIAction(room, rooms, exportObject);
    } else {
      clearAIActionTimer(room);
    }
    if (room.status === 'in_game' && room.engineState) {
      room.game = projectStateToLegacyRoom(room.engineState, room.engineUi, {
        pendingAction: buildPendingBattleAction(room),
      });
    } else {
      room.game = null;
    }
    broadcastRoom(room);
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
    getBroadcastRoom(room);
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
    getBroadcastRoom(room);
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
    getBroadcastRoom(room);
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
    getBroadcastRoom(room);
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
    getBroadcastRoom(room);
  }

  function leaveRoom(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;

    clearAIActionTimer(room);
    room.players = room.players.filter((p) => p.ws !== ws);
    ws.playerRoomCode = null;

    if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      getBroadcastRoom(room);
    }
  }

  function handlePlayAgain(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    clearAIActionTimer(room);
    room.game = null;
    room.engineState = null;
    room.engineUi = null;
    room.status = 'lobby';
    
    // For AI rooms, re-randomize AI loadout
    for (const p of room.players) {
      if (p.ws && p.ws.isAI) {
        const { reRandomizeAIPlayer } = require('../ai');
        reRandomizeAIPlayer(p);
      }
    }
    
    getBroadcastRoom(room);
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

  function startGameIfReady(room) {
    const check = readyToStart(room);
    if (!check.ok) return;

    const battleSeed = `${room.code}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const attackerRng = { rngState: hashSeed(battleSeed) };
    const startingAttacker = nextInt(attackerRng, 2);
    room.status = 'in_game';
    room.battleSeed = battleSeed;
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
      actionBuffer: new Uint16Array(128),
      attackPreviewMask: 0,
      defensePreviewMask: 0,
    };
    room.game = projectStateToLegacyRoom(room.engineState, room.engineUi);
    room.replay = createReplayV1(room, {
      seed: battleSeed,
      startingAttacker,
      roomMode: room.roomMode,
    });
    appendReplaySnapshot(room, room.replay, 'initial_state', 0);
    getBroadcastRoom(room);
  }

  function handleChooseCharacter(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    const { characterId } = payload || {};
    if (!CharacterRegistry[characterId]) return;

    player.characterId = characterId;
    const chosenCharacter = CharacterRegistry[characterId];
    if (allowsNoAurora(chosenCharacter)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = true;
    } else {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = false;
    }

    getBroadcastRoom(room);
    startGameIfReady(room);
  }

  function handleChooseAurora(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    const { auroraDiceId } = payload || {};
    if (auroraDiceId && !AuroraRegistry[auroraDiceId]) return;

    player.auroraDiceId = auroraDiceId || null;
    player.auroraSelectionConfirmed = true;
    getBroadcastRoom(room);
    startGameIfReady(room);
  }

  function handleCreateCustomCharacter(ws, payload) {
    try {
      const created = upsertCustomVariant(payload.variant);
      send(ws, { type: 'custom_character_created', id: created.id });
      return true;
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
      return false;
    }
  }

  function handleListCustomCharacters(ws) {
    send(ws, {
      type: 'custom_characters_list',
      characters: listCustomVariants(),
    });
  }

  function handleUpdateCustomCharacter(ws, payload) {
    try {
      const updated = upsertCustomVariant(payload.variant);
      send(ws, { type: 'custom_character_updated', id: updated.id });
      return true;
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
      return false;
    }
  }

  function handleDeleteCustomCharacter(ws, payload) {
    const characterId = payload.characterId || payload.id;
    const success = removeCustomVariant(characterId);
    if (success) {
      send(ws, { type: 'custom_character_deleted', characterId });
    }
    return success;
  }

  function handleToggleCustomCharacter(ws, payload) {
    const characterId = payload.characterId || payload.id;
    const updated = toggleCustomVariant(characterId, payload.enabled);
    if (updated) {
      send(ws, { type: 'custom_character_updated', characterId: updated.id });
    }
    return !!updated;
  }

  function handleApplyPreset(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    const source = payload && payload.preset && typeof payload.preset === 'object'
      ? payload.preset
      : (payload || {});
    const hasCharacterId = Object.prototype.hasOwnProperty.call(source, 'characterId');
    const hasAuroraDiceId = Object.prototype.hasOwnProperty.call(source, 'auroraDiceId');
    const nextCharacterId = hasCharacterId ? source.characterId : player.characterId;

    if (hasCharacterId) {
      if (!CharacterRegistry[nextCharacterId]) return;
      player.characterId = nextCharacterId;
    }

    const chosenCharacter = CharacterRegistry[player.characterId];
    if (allowsNoAurora(chosenCharacter)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = true;
    } else if (hasAuroraDiceId) {
      if (source.auroraDiceId && AuroraRegistry[source.auroraDiceId]) {
        player.auroraDiceId = source.auroraDiceId;
        player.auroraSelectionConfirmed = true;
      } else {
        player.auroraDiceId = null;
        player.auroraSelectionConfirmed = false;
      }
    } else if (hasCharacterId) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = false;
    }

    getBroadcastRoom(room);
    startGameIfReady(room);
  }

  function applyAction(ws, opcode, mask) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    
    const playerIndex = room.engineUi.indexToPlayerId.indexOf(ws.playerId);
    if (playerIndex === -1) return;

    const logsBefore = room.engineUi.logs.length;
    const effectsBefore = room.engineUi.effectEvents.length;
    const phaseBefore = room.engineState.phase;
    const roundBefore = room.engineState.round;
    const statusBefore = room.engineState.status;
    const winnerBefore = room.engineState.winner;

    const runtime = createRuntime({
      getPlayerName: (idx) => {
        const pid = room.engineUi.indexToPlayerId[idx];
        const p = room.players.find((pp) => pp.id === pid);
        return p ? p.name : `P${idx + 1}`;
      },
      getPlayerId: (idx) => room.engineUi.indexToPlayerId[idx],
      log: (text) => room.engineUi.logs.push(text),
      effect: (event) => {
        const seq = (room.engineUi.effectEvents.length ? room.engineUi.effectEvents[room.engineUi.effectEvents.length - 1].id : 0) + 1;
        room.engineUi.effectEvents.push({ ...event, id: seq });
        if (room.engineUi.effectEvents.length > 50) room.engineUi.effectEvents.shift();
      },
      scratch: { actionBuffer: room.engineUi.actionBuffer, hits: new Int16Array(2) },
    });

    const action = (opcode << 6) | (mask & 0x3f);
    const result = applyActionInPlace(room.engineState, action, runtime);
    
    if (result.ok) {
      recordPureActionReplay(room, action, {
        actorId: ws.playerId,
        actionOutcome: result,
        phaseBefore,
        roundBefore,
        statusBefore,
        winnerBefore,
        logsAdded: room.engineUi.logs.slice(logsBefore),
        effectsAdded: room.engineUi.effectEvents.slice(effectsBefore),
      });
      if (result.status === 'ended') {
        finalizeReplay(room, 'battle_ended');
      }
      room.engineUi.attackPreviewMask = 0;
      room.engineUi.defensePreviewMask = 0;
      getBroadcastRoom(room);
    } else {
      send(ws, { type: 'error', message: result.reason || '操作失败。' });
    }
  }

  function handleRollAttack(ws) {
    applyAction(ws, OPCODES.ROLL_ATTACK, 0);
  }

  function handleUseAurora(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const phase = room.engineState.phase;
    const opcode = (phase === 2 || phase === 3) ? OPCODES.USE_AURORA_DEFENSE : OPCODES.USE_AURORA_ATTACK;
    applyAction(ws, opcode, 0);
  }

  function handleRerollAttack(ws, payload) {
    const mask = indicesToMask(payload.indices);
    applyAction(ws, OPCODES.REROLL_ATTACK, mask);
  }

  function handleUpdateLiveSelection(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const mask = indicesToMask(payload.indices);
    const playerIndex = room.engineUi.indexToPlayerId.indexOf(ws.playerId);
    if (playerIndex === 0) room.engineUi.attackPreviewMask = mask;
    else room.engineUi.defensePreviewMask = mask;
    // Broadcast without full projection overhead if possible, but for simplicity:
    getBroadcastRoom(room);
  }

  function handleConfirmAttack(ws, payload) {
    const mask = indicesToMask(payload.indices);
    applyAction(ws, OPCODES.CONFIRM_ATTACK, mask);
  }

  function handleRollDefense(ws) {
    applyAction(ws, OPCODES.ROLL_DEFENSE, 0);
  }

  function handleConfirmDefense(ws, payload) {
    const mask = indicesToMask(payload.indices);
    applyAction(ws, OPCODES.CONFIRM_DEFENSE, mask);
  }

  function handleExportReplay(ws, payload, envelope) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const replay = exportReplay(room);
    send(ws, {
      type: 'replay_export',
      content: JSON.stringify(replay),
      meta: envelope.meta,
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
    player.ws = null;

    // Remove empty rooms or handle grace period
    if (room.players.every((p) => !p.ws || p.ws.isAI)) {
      rooms.delete(room.code);
    } else {
      getBroadcastRoom(room);
    }
  }

  const exportObject = {
    handleCreateRoom,
    handleCreateAIRoom,
    handleJoinRoom,
    handleResumeSession,
    handleCreateResumeRoom,
    leaveRoom,
    handlePlayAgain,
    handleDisbandRoom,
    handleChooseCharacter,
    handleChooseAurora,
    handleCreateCustomCharacter,
    handleListCustomCharacters,
    handleUpdateCustomCharacter,
    handleDeleteCustomCharacter,
    handleToggleCustomCharacter,
    handleApplyPreset,
    handleRollAttack,
    handleUseAurora,
    handleRerollAttack,
    handleUpdateLiveSelection,
    handleConfirmAttack,
    handleRollDefense,
    handleConfirmDefense,
    handleExportReplay,
    handleSocketClosed,
  };

  return exportObject;
};


