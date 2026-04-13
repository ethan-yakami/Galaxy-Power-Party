const { CharacterRegistry, AuroraRegistry, triggerCharacterHook, saveCustomVariant } = require('./registry');
const {
  makeNormalDiceFromPool,
  rollAuroraFace,
  rerollOneDie,
  sortDice,
  diceToText,
  sumByIndices,
  getEffectiveSelectionCount,
  isValidDistinctIndices,
  isValidDistinctIndicesAnyCount,
  countSelectedValue,
  areAllSame,
  hasDuplicates,
  countPairs,
  areAllValuesSix,
  countOddValues,
} = require('./dice');
const {
  send,
  broadcastRoom: _broadcastRoom,
  newRoomCode,
  getPlayerRoom,
  getPlayerById,
  readyToStart,
  createNewRoomPlayer,
  pushEffectEvent,
} = require('./rooms');
const {
  canUseAurora,
  applyAuroraAEffectOnAttack,
  applyAuroraAEffectOnDefense,
  applyAscension,
  applyHackEffects,
  applyThornsDamage,
  checkGameOver,
  applyCharacterAttackSkill,
  applyGlobalAttackBonuses,
  applyXiadieDefendPassives,
  calcHits,
} = require('./skills');
const {
  ensureWeatherState,
  updateWeatherForNewRound,
  onEndCurrentRound,
  getAttackRerollBonus,
  applySingleDieConstraints,
  applyDiceConstraints,
  onAttackReroll,
  onAttackSelect,
  onDefenseSelect,
  onAfterDamageResolved,
} = require('./weather');
const {
  createAIPlayer,
  reRandomizeAIPlayer,
  scheduleAIAction,
} = require('./ai');
const {
  createBattle,
  enumerateActions,
  applyActionInPlace,
  projectStateToLegacyRoom,
  createRuntime: createBattleRuntime,
  encodeAction,
  indicesToMask,
  OPCODES,
} = require('./battle-engine');
const { STATUS_ENDED, PHASE_ENDED } = require('./battle-engine/constants');

const ALLOWED_VARIANT_OVERRIDE_KEYS = new Set([
  'hp',
  'diceSides',
  'auroraUses',
  'attackLevel',
  'defenseLevel',
  'maxAttackRerolls',
]);

function toInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseOverrides(rawOverrides) {
  if (!isPlainObject(rawOverrides)) {
    return { ok: false, error: 'overrides 必须是对象。', overrides: null };
  }

  const overrides = {};
  const keys = Object.keys(rawOverrides);
  if (keys.length === 0) {
    return { ok: false, error: '至少需要填写一个覆写字段。', overrides: null };
  }

  for (const key of keys) {
    if (!ALLOWED_VARIANT_OVERRIDE_KEYS.has(key)) {
      return { ok: false, error: `不允许覆写字段：${key}`, overrides: null };
    }

    if (key === 'diceSides') {
      const sides = rawOverrides.diceSides;
      if (!Array.isArray(sides) || sides.length === 0) {
        return { ok: false, error: 'diceSides 必须是非空数组。', overrides: null };
      }
      const normalizedSides = [];
      for (const side of sides) {
        const parsed = toInteger(side);
        if (!parsed || parsed < 2) {
          return { ok: false, error: `diceSides 含有非法面值：${side}`, overrides: null };
        }
        normalizedSides.push(parsed);
      }
      overrides.diceSides = normalizedSides;
      continue;
    }

    const parsed = toInteger(rawOverrides[key]);
    if (parsed === null) {
      return { ok: false, error: `${key} 必须是整数。`, overrides: null };
    }

    if (key === 'hp' || key === 'attackLevel' || key === 'defenseLevel') {
      if (parsed <= 0) {
        return { ok: false, error: `${key} 必须大于 0。`, overrides: null };
      }
      overrides[key] = parsed;
      continue;
    }

    if (parsed < 0) {
      return { ok: false, error: `${key} 不能小于 0。`, overrides: null };
    }
    overrides[key] = parsed;
  }

  return { ok: true, error: '', overrides };
}

function countMaskBits(mask) {
  let value = mask >>> 0;
  let count = 0;
  while (value) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

module.exports = function createHandlers(rooms) {

let _handlerRefs = null;
const DEFAULT_ENGINE_MODE = process.env.GPP_ENGINE_MODE === 'pure' ? 'pure' : 'legacy';

const SESSION_GRACE_MS = 90 * 1000;
const OFFLINE_AUTO_DELAY_MS = 900;

function isPureRoom(room) {
  return !!(room && room.engineMode === 'pure');
}

function buildRoomEngineUi(room) {
  const indexToPlayerId = [room.players[0].id, room.players[1].id];
  return {
    indexToPlayerId,
    playerIdToIndex: {
      [indexToPlayerId[0]]: 0,
      [indexToPlayerId[1]]: 1,
    },
    playerNames: [room.players[0].name, room.players[1].name],
    attackPreviewMask: 0,
    defensePreviewMask: 0,
    logs: [],
    effectEvents: [],
    effectEventSeq: 0,
    actionBuffer: new Uint16Array(128),
    lastWeatherNoticeRound: 0,
    runtime: null,
  };
}

function getEnginePlayerIndex(room, playerId) {
  if (!room || !room.engineUi) return -1;
  const value = room.engineUi.playerIdToIndex[playerId];
  return Number.isInteger(value) ? value : -1;
}

function getOrCreateRoomRuntime(room) {
  if (room.engineUi && room.engineUi.runtime) return room.engineUi.runtime;
  room.engineUi.runtime = createBattleRuntime({
    getPlayerName: (index) => room.engineUi.playerNames[index] || `P${index + 1}`,
    getPlayerId: (index) => room.engineUi.indexToPlayerId[index] || `P${index + 1}`,
    log: (message) => {
      room.engineUi.logs.push(message);
    },
    effect: (event) => {
      room.engineUi.effectEventSeq += 1;
      const wrapped = { id: room.engineUi.effectEventSeq, type: event.type };
      if (event.sourcePlayerIndex !== undefined) wrapped.sourcePlayerId = room.engineUi.indexToPlayerId[event.sourcePlayerIndex];
      if (event.targetPlayerIndex !== undefined) wrapped.targetPlayerId = room.engineUi.indexToPlayerId[event.targetPlayerIndex];
      if (event.playerIndex !== undefined) wrapped.playerId = room.engineUi.indexToPlayerId[event.playerIndex];
      if (event.amount !== undefined) wrapped.amount = event.amount;
      if (event.hpBefore !== undefined) wrapped.hpBefore = event.hpBefore;
      if (event.hpAfter !== undefined) wrapped.hpAfter = event.hpAfter;
      if (event.attackValue !== undefined) wrapped.attackValue = event.attackValue;
      if (event.defenseValue !== undefined) wrapped.defenseValue = event.defenseValue;
      if (event.hits !== undefined) wrapped.hits = event.hits;
      if (event.forceField !== undefined) wrapped.forceField = event.forceField;
      if (event.pierce !== undefined) wrapped.pierce = event.pierce;
      if (event.attackerIndex !== undefined) wrapped.attackerId = room.engineUi.indexToPlayerId[event.attackerIndex];
      if (event.defenderIndex !== undefined) wrapped.defenderId = room.engineUi.indexToPlayerId[event.defenderIndex];
      room.engineUi.effectEvents.push(wrapped);
      if (room.engineUi.effectEvents.length > 50) room.engineUi.effectEvents.shift();
    },
  });
  return room.engineUi.runtime;
}

function syncPureRoom(room) {
  if (!room || !room.engineState || !room.engineUi) return;
  room.game = projectStateToLegacyRoom(room.engineState, room.engineUi);
  room.status = room.engineState.status === STATUS_ENDED ? 'ended' : 'in_game';
  if (
    room.engineState.weatherChangedRound === room.engineState.round
    && room.engineUi.lastWeatherNoticeRound !== room.engineState.round
  ) {
    room.game.pendingWeatherChanged = buildWeatherChangedPayload(room.game);
  }
}

function applyPureAction(room, ws, action) {
  const count = enumerateActions(room.engineState, room.engineUi.actionBuffer);
  let found = false;
  for (let i = 0; i < count; i += 1) {
    if (room.engineUi.actionBuffer[i] === action) {
      found = true;
      break;
    }
  }
  if (!found) return { ok: false, reason: 'invalid_action' };
  const result = applyActionInPlace(room.engineState, action, getOrCreateRoomRuntime(room));
  syncPureRoom(room);
  return result;
}

function startPureGame(room, seed, startingAttacker) {
  room.status = 'in_game';
  room.waitingReason = '';
  room.engineUi = buildRoomEngineUi(room);
  room.engineState = createBattle({
    players: room.players.map((player) => ({
      characterId: player.characterId,
      auroraDiceId: player.auroraDiceId,
    })),
  }, seed, { startingAttacker });
  room.engineUi.logs.push(`游戏开始。先手攻击方：${room.engineUi.playerNames[room.engineState.attacker]}。`);
  syncPureRoom(room);
}

function clearPlayerTimers(player) {
  if (!player) return;
  if (player.graceTimer) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }
  if (player.autoActionTimer) {
    clearTimeout(player.autoActionTimer);
    player.autoActionTimer = null;
  }
}

function setPlayerOnline(player, isOnline) {
  if (!player) return;
  player.isOnline = !!isOnline;
  if (isOnline) {
    player.disconnectedAt = null;
    player.graceDeadline = null;
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
  } else {
    player.disconnectedAt = Date.now();
    player.graceDeadline = player.disconnectedAt + SESSION_GRACE_MS;
  }
}

function getActiveActorId(game) {
  if (!game) return null;
  if (game.phase === 'attack_roll' || game.phase === 'attack_reroll_or_select') return game.attackerId;
  if (game.phase === 'defense_roll' || game.phase === 'defense_select') return game.defenderId;
  return null;
}

function pickHighestIndices(dice, needCount, requiredIdx) {
  if (!Array.isArray(dice) || !Number.isInteger(needCount) || needCount <= 0) return [];
  if (needCount >= dice.length) return dice.map((_, i) => i);

  const pairs = dice.map((die, idx) => ({
    idx,
    value: die && Number.isFinite(die.value) ? die.value : 0,
  }));
  pairs.sort((a, b) => b.value - a.value);

  const picked = [];
  if (Number.isInteger(requiredIdx) && requiredIdx >= 0 && requiredIdx < dice.length) {
    picked.push(requiredIdx);
  }
  for (const item of pairs) {
    if (picked.length >= needCount) break;
    if (picked.includes(item.idx)) continue;
    picked.push(item.idx);
  }

  if (picked.length > needCount) picked.length = needCount;
  return picked;
}

function pickRerollIndicesForOfflineAttack(game) {
  const dice = game && game.attackDice ? game.attackDice : [];
  const pairs = [];
  for (let i = 0; i < dice.length; i += 1) {
    const die = dice[i];
    if (!die) continue;
    if (die.isAurora) continue;
    const max = Number.isFinite(die.maxValue) ? die.maxValue : 6;
    const expected = (max + 1) / 2;
    const deficit = expected - die.value;
    if (deficit > 0) {
      pairs.push({ idx: i, deficit });
    }
  }
  pairs.sort((a, b) => b.deficit - a.deficit);
  const chosen = pairs.slice(0, 2).map((x) => x.idx);

  const destinyIdx = dice.findIndex((d) => d && d.isAurora && d.auroraId === 'destiny');
  if (destinyIdx !== -1 && !chosen.includes(destinyIdx)) {
    if (chosen.length >= 2) chosen[chosen.length - 1] = destinyIdx;
    else chosen.push(destinyIdx);
  }

  return chosen.filter((v, i, arr) => arr.indexOf(v) === i);
}

function notifyPresenceChanged(room, player, reason) {
  if (!room || !player) return;
  const payload = {
    type: 'player_presence_changed',
    roomCode: room.code,
    playerId: player.id,
    isOnline: player.isOnline !== false,
    disconnectedAt: player.disconnectedAt || null,
    graceDeadline: player.graceDeadline || null,
    reason: reason || '',
  };
  for (const p of room.players) {
    send(p.ws, payload);
  }
}

function forfeitByDisconnect(room, loser, reasonText) {
  if (!room || room.status !== 'in_game') return;
  if (isPureRoom(room) && room.engineState) {
    if (room.engineState.status === STATUS_ENDED) return;
    const loserIndex = getEnginePlayerIndex(room, loser.id);
    if (loserIndex === -1) return;
    const winnerIndex = loserIndex === 0 ? 1 : 0;
    room.engineState.status = STATUS_ENDED;
    room.engineState.phase = PHASE_ENDED;
    room.engineState.winner = winnerIndex;
    room.engineState.hp[loserIndex] = 0;
    room.engineUi.logs.push(reasonText || `${loser.name} 断线超时，${room.engineUi.playerNames[winnerIndex]} 获胜。`);
    syncPureRoom(room);
    return;
  }
  if (!room.game) return;
  const game = room.game;
  if (game.status === 'ended') return;

  const winner = room.players.find((p) => p.id !== loser.id) || null;
  room.status = 'ended';
  game.status = 'ended';
  game.phase = 'ended';
  game.winnerId = winner ? winner.id : null;
  if (loser && game.hp && loser.id in game.hp) {
    game.hp[loser.id] = 0;
  }
  if (winner) {
    game.log.push(reasonText || `${loser.name} 断线超时，${winner.name} 获胜。`);
  } else {
    game.log.push(reasonText || '对局结束。');
  }
}

function buildWeatherChangedPayload(game) {
  if (!game || !game.weather || !game.weather.weatherId) return null;
  if (game.weather.enteredAtRound !== game.round) return null;
  return {
    type: 'weather_changed',
    weather: {
      weatherId: game.weather.weatherId,
      weatherName: game.weather.weatherName || game.weather.weatherId,
      weatherType: game.weather.weatherType || '',
      stageRound: game.weather.stageRound || 0,
      enteredAtRound: game.weather.enteredAtRound || 0,
    },
    round: game.round,
  };
}

function broadcastRoom(room) {
  _broadcastRoom(room);
  if (room.game && room.game.pendingWeatherChanged) {
    for (const p of room.players) {
      send(p.ws, room.game.pendingWeatherChanged);
    }
    if (isPureRoom(room) && room.engineUi && room.engineState) {
      room.engineUi.lastWeatherNoticeRound = room.engineState.round;
    }
    room.game.pendingWeatherChanged = null;
  }
  if (_handlerRefs) {
    scheduleAIAction(room, rooms, _handlerRefs);
    scheduleOfflineAutoAction(room);
  }
}

function performOfflineAction(room, actor, phaseAtSchedule) {
  if (!room || !room.game || room.status !== 'in_game') return;
  if (!_handlerRefs || !actor) return;

  const game = room.game;
  if (game.status === 'ended') return;
  if (game.phase !== phaseAtSchedule) return;
  if (actor.isOnline !== false) return;
  if (actor.ws && actor.ws.isAI) return;

  const wsLike = actor.ws;
  if (!wsLike) return;

  if (game.phase === 'attack_roll' && game.attackerId === actor.id) {
    _handlerRefs.handleRollAttack(wsLike);
    return;
  }

  if (game.phase === 'attack_reroll_or_select' && game.attackerId === actor.id) {
    if (!game.roundAuroraUsed[actor.id]) {
      const verdict = canUseAurora(actor, game, 'attack');
      if (verdict.ok) {
        _handlerRefs.handleUseAurora(wsLike);
        return;
      }
    }

    if (game.rerollsLeft > 0) {
      const rerollIndices = pickRerollIndicesForOfflineAttack(game);
      if (rerollIndices.length > 0) {
        _handlerRefs.handleRerollAttack(wsLike, { indices: rerollIndices });
        return;
      }
    }

    const need = getEffectiveSelectionCount(game.attackLevel[actor.id], game.attackDice.length);
    const destinyIdx = game.attackDice.findIndex((d) => d && d.isAurora && d.auroraId === 'destiny');
    const indices = pickHighestIndices(game.attackDice, need, destinyIdx);
    _handlerRefs.handleConfirmAttack(wsLike, { indices });
    return;
  }

  if (game.phase === 'defense_roll' && game.defenderId === actor.id) {
    _handlerRefs.handleRollDefense(wsLike);
    return;
  }

  if (game.phase === 'defense_select' && game.defenderId === actor.id) {
    if (!game.roundAuroraUsed[actor.id]) {
      const verdict = canUseAurora(actor, game, 'defense');
      if (verdict.ok) {
        _handlerRefs.handleUseAurora(wsLike);
        return;
      }
    }

    const need = getEffectiveSelectionCount(game.defenseLevel[actor.id], game.defenseDice.length);
    const destinyIdx = game.defenseDice.findIndex((d) => d && d.isAurora && d.auroraId === 'destiny');
    const indices = pickHighestIndices(game.defenseDice, need, destinyIdx);
    _handlerRefs.handleConfirmDefense(wsLike, { indices });
  }
}

function scheduleOfflineAutoAction(room) {
  if (!room || !room.game || room.status !== 'in_game') return;
  const game = room.game;
  if (game.status === 'ended') return;

  const actorId = getActiveActorId(game);
  if (!actorId) return;

  for (const p of room.players) {
    if (p.id !== actorId && p.autoActionTimer) {
      clearTimeout(p.autoActionTimer);
      p.autoActionTimer = null;
    }
  }

  const actor = room.players.find((p) => p.id === actorId);
  if (!actor || actor.isOnline !== false || (actor.ws && actor.ws.isAI)) return;

  if (actor.autoActionTimer) {
    clearTimeout(actor.autoActionTimer);
    actor.autoActionTimer = null;
  }

  const phaseSnapshot = game.phase;
  actor.autoActionTimer = setTimeout(() => {
    actor.autoActionTimer = null;
    performOfflineAction(room, actor, phaseSnapshot);
  }, OFFLINE_AUTO_DELAY_MS);
}

function startGameIfReady(room) {
  if (room.status === 'in_game') return;

  const readiness = readyToStart(room);
  room.waitingReason = readiness.reason;
  if (!readiness.ok) return;

  const p1 = room.players[0];
  const p2 = room.players[1];
  const first = Math.random() < 0.5 ? p1 : p2;
  const second = first.id === p1.id ? p2 : p1;

  const c1 = CharacterRegistry[p1.characterId];
  const c2 = CharacterRegistry[p2.characterId];

  if (isPureRoom(room)) {
    const startingAttacker = first.id === p1.id ? 0 : 1;
    startPureGame(room, `${Date.now()}:${room.code}:${first.id}`, startingAttacker);
    return;
  }

  room.status = 'in_game';
  room.waitingReason = '';
  room.game = {
    status: 'in_game',
    round: 1,
    attackerId: first.id,
    defenderId: second.id,
    phase: 'attack_roll',
    rerollsLeft: 2,
    attackDice: null,
    defenseDice: null,
    attackSelection: null,
    defenseSelection: null,
    attackPreviewSelection: [],
    defensePreviewSelection: [],
    attackValue: null,
    defenseValue: null,
    attackPierce: false,
    lastDamage: null,
    winnerId: null,
    hp: {
      [p1.id]: c1.hp,
      [p2.id]: c2.hp,
    },
    maxHp: {
      [p1.id]: c1.hp,
      [p2.id]: c2.hp,
    },
    attackLevel: {
      [p1.id]: c1.attackLevel,
      [p2.id]: c2.attackLevel,
    },
    defenseLevel: {
      [p1.id]: c1.defenseLevel,
      [p2.id]: c2.defenseLevel,
    },
    diceSidesByPlayer: {
      [p1.id]: c1.diceSides.slice(),
      [p2.id]: c2.diceSides.slice(),
    },
    auroraUsesRemaining: {
      [p1.id]: c1.auroraUses,
      [p2.id]: c2.auroraUses,
    },
    selectedFourCount: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    selectedOneCount: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    cumulativeDamageTaken: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    overload: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    unyielding: {
      [p1.id]: false,
      [p2.id]: false,
    },
    desperateBonus: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    counterActive: {
      [p1.id]: false,
      [p2.id]: false,
    },
    auroraAEffectCount: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    whiteeGuardUsed: {
      [p1.id]: false,
      [p2.id]: false,
    },
    whiteeGuardActive: {
      [p1.id]: false,
      [p2.id]: false,
    },
    roundAuroraUsed: {
      [p1.id]: false,
      [p2.id]: false,
    },
    forceField: {
      [p1.id]: false,
      [p2.id]: false,
    },
    poison: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    resilience: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    thorns: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    power: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    hackActive: {
      [p1.id]: false,
      [p2.id]: false,
    },
    danhengCounterReady: {
      [p1.id]: false,
      [p2.id]: false,
    },
    xilianCumulative: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    xilianAscensionActive: {
      [p1.id]: false,
      [p2.id]: false,
    },
    yaoguangRerollsUsed: {
      [p1.id]: 0,
      [p2.id]: 0,
    },
    extraAttackQueued: false,
    effectEventSeq: 0,
    effectEvents: [],
    pendingWeatherChanged: null,
    log: [`游戏开始。先手攻击方：${first.name}。`],
  };

  ensureWeatherState(room, room.game);
}

function leaveRoom(ws, options = {}) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return;

  const idx = room.players.findIndex((p) => p.id === ws.playerId);
  if (idx === -1) return;

  const leaving = room.players[idx];
  clearPlayerTimers(leaving);
  room.players.splice(idx, 1);
  ws.playerRoomCode = null;

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.players.every((p) => p.ws && p.ws.isAI)) {
    rooms.delete(room.code);
    return;
  }

  if (room.status === 'in_game' && room.game && room.game.status !== 'ended' && room.players.length === 1) {
    forfeitByDisconnect(room, leaving, `${leaving.name} 主动退出，${room.players[0].name} 获胜。`);
  }

  if (room.status === 'lobby') {
    room.waitingReason = '等待另一位玩家加入。';
  }

  if (!options.silentPresence) {
    notifyPresenceChanged(room, leaving, options.reason || 'left_room');
  }
  broadcastRoom(room);
}

function handleSocketClosed(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return;

  const player = getPlayerById(room, ws.playerId);
  if (!player) return;
  if (player.ws !== ws) return;

  setPlayerOnline(player, false);
  notifyPresenceChanged(room, player, 'socket_closed');
  broadcastRoom(room);

  player.graceTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.code);
    if (!currentRoom) return;
    const currentPlayer = currentRoom.players.find((p) => p.id === player.id);
    if (!currentPlayer || currentPlayer.isOnline !== false) return;

    if (currentRoom.status === 'in_game' && currentRoom.game && currentRoom.game.status !== 'ended') {
      forfeitByDisconnect(currentRoom, currentPlayer, `${currentPlayer.name} 断线超时，判负。`);
      notifyPresenceChanged(currentRoom, currentPlayer, 'disconnect_timeout');
      broadcastRoom(currentRoom);
      return;
    }

    const removeIdx = currentRoom.players.findIndex((p) => p.id === currentPlayer.id);
    if (removeIdx !== -1) {
      currentRoom.players.splice(removeIdx, 1);
    }
    if (currentRoom.players.length === 0) {
      rooms.delete(currentRoom.code);
      return;
    }
    if (currentRoom.status === 'lobby') {
      currentRoom.waitingReason = '等待另一位玩家加入。';
    }
    notifyPresenceChanged(currentRoom, currentPlayer, 'disconnect_removed');
    broadcastRoom(currentRoom);
  }, SESSION_GRACE_MS);
}
function handleCreateRoom(ws, msg) {
  if (!msg.name || typeof msg.name !== 'string') return send(ws, { type: 'error', message: '请输入玩家名称。' });
  if (getPlayerRoom(ws, rooms)) leaveRoom(ws, { reason: 'switch_room' });

  const code = newRoomCode(rooms);
  const room = {
    code,
    status: 'lobby',
    waitingReason: '等待另一位玩家加入。',
    players: [],
    game: null,
    engineMode: DEFAULT_ENGINE_MODE,
    engineState: null,
    engineUi: null,
  };

  rooms.set(code, room);

  room.players.push(createNewRoomPlayer(ws, msg.name.trim().slice(0, 20) || `玩家${ws.playerId}`));
  ws.playerRoomCode = code;

  startGameIfReady(room);
  broadcastRoom(room);
}

function handleJoinRoom(ws, msg) {
  const name = (msg.name || '').trim();
  const code = String(msg.code || '').trim();

  if (!name) return send(ws, { type: 'error', message: '请输入玩家名称。' });
  if (!/^\d{4}$/.test(code)) return send(ws, { type: 'error', message: '房间号必须是4位数字。' });

  const room = rooms.get(code);
  if (!room) return send(ws, { type: 'error', message: '房间不存在。' });
  if (room.players.length >= 2) return send(ws, { type: 'error', message: '房间已满。' });

  if (getPlayerRoom(ws, rooms)) leaveRoom(ws, { reason: 'switch_room' });

  room.players.push(createNewRoomPlayer(ws, name.slice(0, 20)));
  ws.playerRoomCode = code;

  startGameIfReady(room);
  broadcastRoom(room);
}

function handleResumeSession(ws, msg) {
  const roomCode = String((msg && msg.roomCode) || '').trim();
  const reconnectToken = String((msg && msg.reconnectToken) || '').trim();
  if (!roomCode || !reconnectToken) {
    send(ws, { type: 'session_resume_failed', reason: 'missing_params' });
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    send(ws, { type: 'session_resume_failed', reason: 'room_not_found' });
    return;
  }

  const player = room.players.find((p) => p.reconnectToken === reconnectToken);
  if (!player) {
    send(ws, { type: 'session_resume_failed', reason: 'token_mismatch' });
    return;
  }

  if (player.graceDeadline && Date.now() > player.graceDeadline && player.isOnline === false) {
    send(ws, { type: 'session_resume_failed', reason: 'grace_expired' });
    return;
  }

  if (getPlayerRoom(ws, rooms)) {
    leaveRoom(ws, { reason: 'switch_room', silentPresence: true });
  }

  const oldWs = player.ws;
  if (oldWs && oldWs !== ws) {
    oldWs.playerRoomCode = null;
  }

  player.ws = ws;
  ws.playerId = player.id;
  ws.playerRoomCode = room.code;
  ws.reconnectToken = player.reconnectToken;
  setPlayerOnline(player, true);

  send(ws, {
    type: 'session_resumed',
    playerId: player.id,
    roomCode: room.code,
  });
  notifyPresenceChanged(room, player, 'session_resumed');
  broadcastRoom(room);
}

function handleChooseCharacter(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return send(ws, { type: 'error', message: '你不在房间内。' });
  if (room.status !== 'lobby') return send(ws, { type: 'error', message: '游戏已开始，不能更换角色。' });

  const characterId = msg.characterId;
  if (!CharacterRegistry[characterId]) return send(ws, { type: 'error', message: '无效角色。' });

  const me = getPlayerById(room, ws.playerId);
  if (!me) return;

  me.characterId = characterId;

  startGameIfReady(room);
  broadcastRoom(room);
}

function handleChooseAurora(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return send(ws, { type: 'error', message: '你不在房间内。' });
  if (room.status !== 'lobby') return send(ws, { type: 'error', message: '游戏已开始，不能更换曜彩骰。' });

  const me = getPlayerById(room, ws.playerId);
  if (!me) return;

  const ch = CharacterRegistry[me.characterId];
  if (!ch) return;

  const auroraId = msg.auroraDiceId;
  if (!AuroraRegistry[auroraId]) return send(ws, { type: 'error', message: '无效曜彩骰。' });

  me.auroraDiceId = auroraId;
  startGameIfReady(room);
  broadcastRoom(room);
}

function handleCreateCustomCharacter(ws, msg) {
  const rawVariant = msg && msg.variant;
  if (!isPlainObject(rawVariant)) {
    send(ws, { type: 'error', message: '自定义角色参数无效。' });
    return false;
  }

  const id = typeof rawVariant.id === 'string' ? rawVariant.id.trim() : '';
  if (!id || !/^[a-z0-9_]{3,40}$/.test(id)) {
    send(ws, { type: 'error', message: '角色 ID 必须是 3-40 位小写字母/数字/下划线。' });
    return false;
  }
  if (CharacterRegistry[id]) {
    send(ws, { type: 'error', message: `角色 ID 已存在：${id}` });
    return false;
  }

  const baseCharacterId = typeof rawVariant.baseCharacterId === 'string'
    ? rawVariant.baseCharacterId.trim()
    : '';
  if (!baseCharacterId || !CharacterRegistry[baseCharacterId]) {
    send(ws, { type: 'error', message: `母角色不存在：${baseCharacterId || '(空)'}` });
    return false;
  }
  if (CharacterRegistry[baseCharacterId].isCustomVariant) {
    send(ws, { type: 'error', message: '母角色必须是原版角色，不能再以自定义变体为母本。' });
    return false;
  }

  const overrideResult = parseOverrides(rawVariant.overrides);
  if (!overrideResult.ok) {
    send(ws, { type: 'error', message: overrideResult.error });
    return false;
  }

  const name = typeof rawVariant.name === 'string' && rawVariant.name.trim()
    ? rawVariant.name.trim().slice(0, 40)
    : `${CharacterRegistry[baseCharacterId].name} 鍙樹綋`;

  const variantToSave = {
    id,
    baseCharacterId,
    name,
    overrides: overrideResult.overrides,
    enabled: rawVariant.enabled !== false,
  };

  try {
    saveCustomVariant(variantToSave);
  } catch (err) {
    console.error('[Error] saveCustomVariant:', err);
    send(ws, { type: 'error', message: '保存自定义角色失败，请检查服务端日志。' });
    return false;
  }

  send(ws, {
    type: 'custom_character_created',
    characterId: id,
    baseCharacterId,
    name,
  });
  return true;
}

function handleRollAttack(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (actorIndex !== room.engineState.attacker || room.engineState.phase !== 0) return;
    room.engineUi.attackPreviewMask = 0;
    room.engineUi.defensePreviewMask = 0;
    const result = applyPureAction(room, ws, encodeAction(OPCODES.ROLL_ATTACK, 0));
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_roll') return;
  if (game.attackerId !== ws.playerId) return;

  const attacker = getPlayerById(room, game.attackerId);
  const defender = getPlayerById(room, game.defenderId);

  game.attackDice = makeNormalDiceFromPool(game.diceSidesByPlayer[attacker.id]);
  applyDiceConstraints(room, game, game.attackDice, 'attack');
  sortDice(game.attackDice);
  const attackerCharacter = CharacterRegistry[attacker.characterId];
  game.rerollsLeft = attackerCharacter ? attackerCharacter.maxAttackRerolls : 2;
  const weatherRerollBonus = getAttackRerollBonus(game);
  if (weatherRerollBonus > 0) {
    game.rerollsLeft += weatherRerollBonus;
    game.log.push(`【天气】${game.weather.weatherName}生效：本回合额外重投+${weatherRerollBonus}。`);
  }
  game.attackSelection = null;
  game.attackPreviewSelection = [];
  game.attackValue = null;
  game.attackPierce = false;

  game.defenseDice = null;
  game.defenseSelection = null;
  game.defensePreviewSelection = [];
  game.defenseValue = null;

  game.extraAttackQueued = false;
  game.roundAuroraUsed[attacker.id] = false;
  game.roundAuroraUsed[defender.id] = false;
  game.forceField[attacker.id] = false;
  game.forceField[defender.id] = false;
  game.whiteeGuardActive[attacker.id] = false;
  game.whiteeGuardActive[defender.id] = false;
  game.hackActive[attacker.id] = false;
  game.hackActive[defender.id] = false;
  game.unyielding[attacker.id] = false;
  game.unyielding[defender.id] = false;
  game.desperateBonus[attacker.id] = 0;
  game.desperateBonus[defender.id] = 0;
  game.yaoguangRerollsUsed[attacker.id] = 0;

  game.phase = 'attack_reroll_or_select';
  game.log.push(`${attacker.name}鎶曟幏鏀诲嚮楠帮細${diceToText(game.attackDice)}`);

  broadcastRoom(room);
}

function handleUseAurora(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    let action = null;
    if (room.engineState.phase === 1 && actorIndex === room.engineState.attacker) {
      room.engineUi.attackPreviewMask = 0;
      action = encodeAction(OPCODES.USE_AURORA_ATTACK, 0);
    } else if (room.engineState.phase === 3 && actorIndex === room.engineState.defender) {
      room.engineUi.defensePreviewMask = 0;
      action = encodeAction(OPCODES.USE_AURORA_DEFENSE, 0);
    } else {
      return;
    }
    const result = applyPureAction(room, ws, action);
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game') return;

  let role;
  if (game.phase === 'attack_reroll_or_select' && game.attackerId === ws.playerId) {
    role = 'attack';
  } else if (game.phase === 'defense_select' && game.defenderId === ws.playerId) {
    role = 'defense';
  } else {
    return;
  }

  const me = getPlayerById(room, ws.playerId);
  if (!me) return;

  const verdict = canUseAurora(me, game, role);
  if (!verdict.ok) return send(ws, { type: 'error', message: verdict.reason });

  const die = rollAuroraFace(me.auroraDiceId);
  const constrainedDie = applySingleDieConstraints(room, game, die, role);
  if (role === 'attack') {
    game.attackDice.push(constrainedDie);
    sortDice(game.attackDice);
    game.attackPreviewSelection = [];
  } else {
    game.defenseDice.push(constrainedDie);
    sortDice(game.defenseDice);
    game.defensePreviewSelection = [];
  }

  game.auroraUsesRemaining[me.id] -= 1;
  game.roundAuroraUsed[me.id] = true;

  game.log.push(`${me.name}使用曜彩骰【${AuroraRegistry[me.auroraDiceId].name}】，投出 ${constrainedDie.label}。`);
  broadcastRoom(room);
}

function handleRerollAttack(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (actorIndex !== room.engineState.attacker || room.engineState.phase !== 1) return;
    const mask = indicesToMask(msg.indices, room.engineState.attackRoll.count);
    if (mask < 0 || mask === 0) return send(ws, { type: 'error', message: '重投参数无效。' });
    room.engineUi.attackPreviewMask = 0;
    const result = applyPureAction(room, ws, encodeAction(OPCODES.REROLL_ATTACK, mask));
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_reroll_or_select') return;
  if (game.attackerId !== ws.playerId) return;
  if (game.rerollsLeft <= 0) return send(ws, { type: 'error', message: '没有剩余重投次数。' });

  const attacker = getPlayerById(room, game.attackerId);
  const indices = msg.indices;
  const uniqueIndices = [];
  const seen = new Set();

  if (!Array.isArray(indices)) return send(ws, { type: 'error', message: '重投参数无效。' });
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= game.attackDice.length) {
      return send(ws, { type: 'error', message: '重投索引无效。' });
    }
    if (!seen.has(idx)) {
      seen.add(idx);
      uniqueIndices.push(idx);
    }
  }

  const destinyIdx = game.attackDice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  if (destinyIdx !== -1 && !uniqueIndices.includes(destinyIdx)) {
    return send(ws, { type: 'error', message: '命定：重投时必须包含命定曜彩骰。' });
  }

  for (const idx of uniqueIndices) {
    game.attackDice[idx] = rerollOneDie(game.attackDice[idx], attacker);
    game.attackDice[idx] = applySingleDieConstraints(room, game, game.attackDice[idx], 'attack');
  }

  sortDice(game.attackDice);
  game.attackPreviewSelection = [];
  game.rerollsLeft -= 1;

  onAttackReroll(room, game, attacker);
  triggerCharacterHook('onReroll', attacker, game, attacker);

  game.log.push(`${attacker.name}重投${uniqueIndices.length}枚攻击骰，结果：${diceToText(game.attackDice)}（剩余重投${game.rerollsLeft}次）`);
  broadcastRoom(room);
}

function handleConfirmAttack(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (actorIndex !== room.engineState.attacker || room.engineState.phase !== 1) return;
    const mask = indicesToMask(msg.indices, room.engineState.attackRoll.count);
    if (mask < 0) return send(ws, { type: 'error', message: '必须选择有效的骰子。' });
    const result = applyPureAction(room, ws, encodeAction(OPCODES.CONFIRM_ATTACK, mask));
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    room.engineUi.attackPreviewMask = mask;
    room.engineUi.defensePreviewMask = 0;
    syncPureRoom(room);
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_reroll_or_select') return;
  if (game.attackerId !== ws.playerId) return;

  const attacker = getPlayerById(room, game.attackerId);
  const defender = getPlayerById(room, game.defenderId);
  const needCount = getEffectiveSelectionCount(game.attackLevel[attacker.id], game.attackDice.length);
  const indices = msg.indices;

  if (!isValidDistinctIndices(indices, needCount, game.attackDice.length)) {
    return send(ws, { type: 'error', message: `必须选择${needCount}枚不同的骰子。` });
  }

  // Destiny (命定) validation: aurora die must be selected
  const destinyIdx = game.attackDice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  if (destinyIdx !== -1 && !indices.includes(destinyIdx)) {
    return send(ws, { type: 'error', message: '命定：曜彩骰必须被选中。' });
  }

  const selectedDice = indices.map((idx) => game.attackDice[idx]);
  game.selectedFourCount[attacker.id] += countSelectedValue(selectedDice, 4);
  game.selectedOneCount[attacker.id] += countSelectedValue(selectedDice, 1);

  applyAscension(room, game, attacker, selectedDice);
  applyCharacterAttackSkill(room, game, attacker, selectedDice);

  game.attackSelection = indices;
  game.attackPreviewSelection = indices.slice();
  game.attackValue = sumByIndices(game.attackDice, indices);
  let attackBonusParts = applyGlobalAttackBonuses(game, attacker);

  triggerCharacterHook('onMainAttackConfirm', attacker, game, attacker, selectedDice, room);
  attackBonusParts = applyGlobalAttackBonuses(game, attacker, attackBonusParts);
  applyAuroraAEffectOnAttack(room, game, attacker, selectedDice);
  attackBonusParts = applyGlobalAttackBonuses(game, attacker, attackBonusParts);
  onAttackSelect(room, game, attacker, defender, selectedDice);
  applyGlobalAttackBonuses(game, attacker, attackBonusParts);

  if (checkGameOver(room, game)) {
    broadcastRoom(room);
    return;
  }

  game.phase = 'defense_roll';
  game.defensePreviewSelection = [];
  game.log.push(`${attacker.name}确认攻击值：${game.attackValue}`);

  broadcastRoom(room);
}

function handleRollDefense(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (actorIndex !== room.engineState.defender || room.engineState.phase !== 2) return;
    room.engineUi.defensePreviewMask = 0;
    const result = applyPureAction(room, ws, encodeAction(OPCODES.ROLL_DEFENSE, 0));
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'defense_roll') return;
  if (game.defenderId !== ws.playerId) return;

  const defender = getPlayerById(room, game.defenderId);

  triggerCharacterHook('onDefenseRoll', defender, game, defender);

  game.defenseDice = makeNormalDiceFromPool(game.diceSidesByPlayer[defender.id]);
  applyDiceConstraints(room, game, game.defenseDice, 'defense');
  sortDice(game.defenseDice);

  game.defenseSelection = null;
  game.defensePreviewSelection = [];
  game.defenseValue = null;
  game.phase = 'defense_select';
  game.log.push(`${defender.name}投掷防御骰：${diceToText(game.defenseDice)}`);

  broadcastRoom(room);
}

function goNextRound(room, game, newAttacker, newDefender) {
  game.pendingWeatherChanged = null;
  const endingAttackerId = game.attackerId;
  onEndCurrentRound(room, game, endingAttackerId);

  for (const p of room.players) {
    if (game.poison[p.id] > 0) {
      const opponent = room.players.find((q) => q.id !== p.id);
      const before = game.hp[p.id];
      game.hp[p.id] -= game.poison[p.id];
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: opponent ? opponent.id : p.id,
        targetPlayerId: p.id,
        amount: game.poison[p.id],
        hpBefore: before,
        hpAfter: game.hp[p.id],
      });
      game.log.push(`${p.name}受到${game.poison[p.id]}层中毒伤害。`);
      game.poison[p.id] -= 1;
    }
  }

  for (const p of room.players) {
    triggerCharacterHook('onRoundEnd', p, game, p);
  }

  game.round += 1;
  game.attackerId = newAttacker.id;
  game.defenderId = newDefender.id;
  game.phase = 'attack_roll';
  game.attackDice = null;
  game.defenseDice = null;
  game.attackSelection = null;
  game.defenseSelection = null;
  game.attackPreviewSelection = [];
  game.defensePreviewSelection = [];
  game.attackValue = null;
  game.defenseValue = null;
  game.attackPierce = false;
  game.rerollsLeft = 2;
  game.extraAttackQueued = false;
  game.roundAuroraUsed[newAttacker.id] = false;
  game.roundAuroraUsed[newDefender.id] = false;
  game.forceField[newAttacker.id] = false;
  game.forceField[newDefender.id] = false;
  game.whiteeGuardActive[newAttacker.id] = false;
  game.whiteeGuardActive[newDefender.id] = false;
  game.hackActive[newAttacker.id] = false;
  game.hackActive[newDefender.id] = false;
  game.unyielding[newAttacker.id] = false;
  game.unyielding[newDefender.id] = false;
  game.desperateBonus[newAttacker.id] = 0;
  game.desperateBonus[newDefender.id] = 0;
  game.counterActive[newAttacker.id] = false;
  game.counterActive[newDefender.id] = false;
  game.yaoguangRerollsUsed[newAttacker.id] = 0;
  game.yaoguangRerollsUsed[newDefender.id] = 0;

  updateWeatherForNewRound(room, game);
  game.pendingWeatherChanged = buildWeatherChangedPayload(game);
  game.log.push(`第${game.round}回合开始，攻击方：${newAttacker.name}`);
}

function handleConfirmDefense(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (actorIndex !== room.engineState.defender || room.engineState.phase !== 3) return;
    const mask = indicesToMask(msg.indices, room.engineState.defenseRoll.count);
    if (mask < 0) return send(ws, { type: 'error', message: '必须选择有效的骰子。' });
    const result = applyPureAction(room, ws, encodeAction(OPCODES.CONFIRM_DEFENSE, mask));
    if (!result.ok) return send(ws, { type: 'error', message: result.reason || '操作失败。' });
    if (room.engineState.phase === 0 || room.engineState.phase === 4) {
      room.engineUi.attackPreviewMask = 0;
      room.engineUi.defensePreviewMask = 0;
    } else {
      room.engineUi.defensePreviewMask = mask;
    }
    syncPureRoom(room);
    broadcastRoom(room);
    return;
  }
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'defense_select') return;
  if (game.defenderId !== ws.playerId) return;

  const defender = getPlayerById(room, game.defenderId);
  const attacker = getPlayerById(room, game.attackerId);
  const needCount = getEffectiveSelectionCount(game.defenseLevel[defender.id], game.defenseDice.length);
  const indices = msg.indices;

  if (!isValidDistinctIndices(indices, needCount, game.defenseDice.length)) {
    return send(ws, { type: 'error', message: `必须选择${needCount}枚不同的骰子。` });
  }

  // Destiny (命定) validation: aurora die must be selected
  const destinyIdx = game.defenseDice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  if (destinyIdx !== -1 && !indices.includes(destinyIdx)) {
    return send(ws, { type: 'error', message: '命定：曜彩骰必须被选中。' });
  }

  const selectedDice = indices.map((idx) => game.defenseDice[idx]);
  game.selectedFourCount[defender.id] += countSelectedValue(selectedDice, 4);
  game.selectedOneCount[defender.id] += countSelectedValue(selectedDice, 1);

  applyAscension(room, game, defender, selectedDice);

  triggerCharacterHook('onDefenseConfirm', defender, game, defender, selectedDice, room);

  game.defenseSelection = indices;
  game.defensePreviewSelection = indices.slice();
  game.defenseValue = sumByIndices(game.defenseDice, indices);

  triggerCharacterHook('onMainDefenseConfirm', defender, game, defender, selectedDice, room);

  applyAuroraAEffectOnDefense(room, game, defender, selectedDice);
  applyHackEffects(game, attacker, defender);
  onDefenseSelect(room, game, defender, selectedDice);

  // Overload (超载) defense self-damage
  if (game.overload[defender.id] > 0) {
    const overloadDmg = Math.ceil(game.overload[defender.id] * 0.5);
    const before = game.hp[defender.id];
    game.hp[defender.id] -= overloadDmg;
    pushEffectEvent(game, {
      type: 'instant_damage',
      sourcePlayerId: defender.id,
      targetPlayerId: defender.id,
      amount: overloadDmg,
      hpBefore: before,
      hpAfter: game.hp[defender.id],
    });
    game.log.push(`${defender.name}触发【超载】防御自伤${overloadDmg}点。`);
  }

  applyThornsDamage(game, room);

  // Damage calculation
  const rawHits = calcHits(game);
  const hpBeforeDef = game.hp[defender.id];

  const hitsAfterForce = rawHits.map((h) => {
    if (game.attackPierce) return h;
    if (game.forceField[defender.id]) return 0;
    return h;
  });

  let cappedHits = hitsAfterForce.slice();
  if (game.whiteeGuardActive[defender.id] || game.unyielding[defender.id]) {
    const total = cappedHits.reduce((a, b) => a + b, 0);
    const maxLoss = Math.max(0, hpBeforeDef - 1);
    if (total > maxLoss) {
      let remain = maxLoss;
      cappedHits = cappedHits.map((h) => {
        const part = h > remain ? remain : h;
        remain -= part;
        return part;
      });
      if (game.unyielding[defender.id]) {
        game.log.push(`${defender.name}的不屈生效，生命值保留至1。`);
      }
    }
  }

  let totalDamage = 0;
  for (const h of cappedHits) totalDamage += h;

  game.lastDamage = totalDamage;
  game.hp[defender.id] -= totalDamage;
  const hpAfterDef = game.hp[defender.id];

  pushEffectEvent(game, {
    type: 'damage_resolution',
    attackerId: attacker.id,
    defenderId: defender.id,
    attackValue: game.attackValue,
    defenseValue: game.defenseValue,
    hits: cappedHits,
    forceField: !!(game.forceField[defender.id] && !game.attackPierce),
    hpBefore: hpBeforeDef,
    hpAfter: hpAfterDef,
    pierce: !!game.attackPierce,
  });

  if (game.extraAttackQueued) {
    game.log.push(`${attacker.name}发动连击追加攻击，总伤害${totalDamage}。`);
  } else {
    game.log.push(`${attacker.name}攻击${defender.name}，攻击值${game.attackValue}，防御值${game.defenseValue}，造成${totalDamage}点伤害。`);
  }

  // Track cumulative damage taken
  if (totalDamage > 0) {
    game.cumulativeDamageTaken[defender.id] += totalDamage;
  }

  // Xiadie passives
  applyXiadieDefendPassives(room, game, defender, attacker, cappedHits);

  // Trigger attacker's post-damage hooks
  triggerCharacterHook('onAttackAfterDamageResolved', attacker, game, attacker, totalDamage);

  // Trigger defender's post-damage hooks
  triggerCharacterHook('onAfterDamageResolved', defender, game, defender, attacker, totalDamage);

  onAfterDamageResolved(room, game, attacker, defender, totalDamage);

  // Cactus counter resolution (Generic counter mechanics)
  if (game.counterActive[defender.id]) {
    game.counterActive[defender.id] = false;
    if (!game.attackPierce && game.defenseValue > game.attackValue) {
      const counterDmg = game.defenseValue - game.attackValue;
      const before = game.hp[attacker.id];
      game.hp[attacker.id] -= counterDmg;
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: defender.id,
        targetPlayerId: attacker.id,
        amount: counterDmg,
        hpBefore: before,
        hpAfter: game.hp[attacker.id],
      });
      game.log.push(`${defender.name}触发【反击】，对${attacker.name}造成${counterDmg}点反击伤害！`);
    }
  }

  if (checkGameOver(room, game)) {
    broadcastRoom(room);
    return;
  }

  goNextRound(room, game, defender, attacker);

  if (checkGameOver(room, game)) {
    broadcastRoom(room);
    return;
  }

  broadcastRoom(room);
}

function handleUpdateLiveSelection(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  if (isPureRoom(room) && room.engineState) {
    const indices = msg.indices;
    if (!Array.isArray(indices)) return;
    const actorIndex = getEnginePlayerIndex(room, ws.playerId);
    if (room.engineState.phase === 1 && actorIndex === room.engineState.attacker) {
      const mask = indicesToMask(indices, room.engineState.attackRoll.count);
      if (mask < 0) return;
      room.engineUi.attackPreviewMask = mask;
      syncPureRoom(room);
      broadcastRoom(room);
      return;
    }
    if (room.engineState.phase === 3 && actorIndex === room.engineState.defender) {
      const mask = indicesToMask(indices, room.engineState.defenseRoll.count);
      if (mask < 0) return;
      const need = room.engineState.defenseLevel[room.engineState.defender] > room.engineState.defenseRoll.count
        ? room.engineState.defenseRoll.count
        : room.engineState.defenseLevel[room.engineState.defender];
      if (countMaskBits(mask) > need) return;
      room.engineUi.defensePreviewMask = mask;
      syncPureRoom(room);
      broadcastRoom(room);
    }
    return;
  }

  const game = room.game;
  if (room.status !== 'in_game') return;

  const indices = msg.indices;
  if (!Array.isArray(indices)) return;

  if (game.phase === 'attack_reroll_or_select' && game.attackerId === ws.playerId && game.attackDice) {
    if (!isValidDistinctIndicesAnyCount(indices, game.attackDice.length)) return;
    game.attackPreviewSelection = indices.slice();
    broadcastRoom(room);
    return;
  }

  if (game.phase === 'defense_select' && game.defenderId === ws.playerId && game.defenseDice) {
    if (!isValidDistinctIndicesAnyCount(indices, game.defenseDice.length)) return;
    const need = getEffectiveSelectionCount(game.defenseLevel[game.defenderId], game.defenseDice.length);
    if (indices.length > need) return;
    game.defensePreviewSelection = indices.slice();
    broadcastRoom(room);
  }
}

function handlePlayAgain(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return;
  if (room.status !== 'ended') return send(ws, { type: 'error', message: '当前不在结算阶段。' });

  room.status = 'lobby';
  room.game = null;
  room.engineState = null;
  room.engineUi = null;
  room.waitingReason = '绛夊緟鍙屾柟纭寮€灞€閰嶇疆。';

  for (const p of room.players) {
    clearPlayerTimers(p);
    p.characterId = null;
    p.auroraDiceId = null;
    if (p.ws && p.ws.isAI) {
      // AI keeps auto-loadout capability while humans must re-select.
      reRandomizeAIPlayer(p);
    }
  }

  broadcastRoom(room);
}

function handleDisbandRoom(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return;

  const players = room.players.slice();
  rooms.delete(room.code);

  for (const p of players) {
    p.ws.playerRoomCode = null;
    send(p.ws, { type: 'left_room', reason: '房间已解散。' });
  }
}

function handleCreateAIRoom(ws, msg) {
  if (!msg.name || typeof msg.name !== 'string') return send(ws, { type: 'error', message: '请输入玩家名称。' });
  if (getPlayerRoom(ws, rooms)) leaveRoom(ws, { reason: 'switch_room' });

  const code = newRoomCode(rooms);
  const room = {
    code,
    status: 'lobby',
    waitingReason: '',
    players: [],
    game: null,
    engineMode: DEFAULT_ENGINE_MODE,
    engineState: null,
    engineUi: null,
  };

  rooms.set(code, room);

  room.players.push(createNewRoomPlayer(ws, msg.name.trim().slice(0, 20) || `玩家${ws.playerId}`));
  ws.playerRoomCode = code;

  const aiPlayer = createAIPlayer(code);
  room.players.push(aiPlayer);

  startGameIfReady(room);
  broadcastRoom(room);
}

_handlerRefs = {
  handleRollAttack,
  handleUseAurora,
  handleRerollAttack,
  handleConfirmAttack,
  handleRollDefense,
  handleConfirmDefense,
};

return {
  leaveRoom,
  handleSocketClosed,
  handleCreateRoom,
  handleJoinRoom,
  handleResumeSession,
  handleChooseCharacter,
  handleChooseAurora,
  handleCreateCustomCharacter,
  handleRollAttack,
  handleUseAurora,
  handleRerollAttack,
  handleConfirmAttack,
  handleRollDefense,
  handleConfirmDefense,
  handleUpdateLiveSelection,
  handlePlayAgain,
  handleDisbandRoom,
  handleCreateAIRoom,
};

}; // end createHandlers



