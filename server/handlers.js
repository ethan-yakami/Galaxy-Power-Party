const CharacterHooks = require('./characterHooks');
const { CHARACTERS, AURORA_DICE } = require('./characters');
const {
  makeNormalDiceFromPool,
  rollAuroraFace,
  rerollOneDie,
  sortDice,
  diceToText,
  sumByIndices,
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
  applyXiadieDefendPassives,
  calcHits,
} = require('./skills');
const {
  createAIPlayer,
  reRandomizeAIPlayer,
  scheduleAIAction,
} = require('./ai');

module.exports = function createHandlers(rooms) {

let _handlerRefs = null;

function broadcastRoom(room) {
  _broadcastRoom(room);
  if (_handlerRefs) scheduleAIAction(room, rooms, _handlerRefs);
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

  const c1 = CHARACTERS[p1.characterId];
  const c2 = CHARACTERS[p2.characterId];

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
    log: [`游戏开始。先手攻击方：${first.name}。`],
  };
}

function leaveRoom(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return;

  const idx = room.players.findIndex((p) => p.id === ws.playerId);
  if (idx !== -1) {
    room.players.splice(idx, 1);
    if (room.game && room.status === 'in_game' && room.players.length === 1) {
      const remaining = room.players[0];
      remaining.ws.playerRoomCode = null;
      send(remaining.ws, { type: 'left_room', reason: '对手已离开房间，房间已关闭。' });
      rooms.delete(room.code);
      ws.playerRoomCode = null;
      return;
    }
  }

  ws.playerRoomCode = null;

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  // Clean up rooms with only AI players remaining
  if (room.players.every((p) => p.ws && p.ws.isAI)) {
    rooms.delete(room.code);
    return;
  }

  if (room.status === 'lobby') {
    startGameIfReady(room);
  }

  broadcastRoom(room);
}

function handleCreateRoom(ws, msg) {
  if (!msg.name || typeof msg.name !== 'string') return send(ws, { type: 'error', message: '请输入玩家名称。' });
  if (getPlayerRoom(ws, rooms)) leaveRoom(ws);

  const code = newRoomCode(rooms);
  const room = {
    code,
    status: 'lobby',
    waitingReason: '等待另一位玩家加入。',
    players: [],
    game: null,
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

  if (getPlayerRoom(ws, rooms)) leaveRoom(ws);

  room.players.push(createNewRoomPlayer(ws, name.slice(0, 20)));
  ws.playerRoomCode = code;

  startGameIfReady(room);
  broadcastRoom(room);
}

function handleChooseCharacter(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room) return send(ws, { type: 'error', message: '你不在房间内。' });
  if (room.status !== 'lobby') return send(ws, { type: 'error', message: '游戏已开始，不能更换角色。' });

  const characterId = msg.characterId;
  if (!CHARACTERS[characterId]) return send(ws, { type: 'error', message: '无效角色。' });

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

  const ch = CHARACTERS[me.characterId];
  if (!ch) return;

  const auroraId = msg.auroraDiceId;
  if (!AURORA_DICE[auroraId]) return send(ws, { type: 'error', message: '无效曜彩骰。' });

  me.auroraDiceId = auroraId;
  startGameIfReady(room);
  broadcastRoom(room);
}

function handleRollAttack(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_roll') return;
  if (game.attackerId !== ws.playerId) return;

  const attacker = getPlayerById(room, game.attackerId);
  const defender = getPlayerById(room, game.defenderId);

  game.attackDice = makeNormalDiceFromPool(game.diceSidesByPlayer[attacker.id]);
  sortDice(game.attackDice);
  game.rerollsLeft = attacker.characterId === 'yaoguang' ? 4 : 2;
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
  game.counterActive[attacker.id] = false;
  game.counterActive[defender.id] = false;
  game.yaoguangRerollsUsed[attacker.id] = 0;

  game.phase = 'attack_reroll_or_select';
  game.log.push(`${attacker.name}投掷攻击骰：${diceToText(game.attackDice)}`);

  broadcastRoom(room);
}

function handleUseAurora(ws) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
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
  if (role === 'attack') {
    game.attackDice.push(die);
    sortDice(game.attackDice);
    game.attackPreviewSelection = [];
  } else {
    game.defenseDice.push(die);
    sortDice(game.defenseDice);
    game.defensePreviewSelection = [];
  }

  game.auroraUsesRemaining[me.id] -= 1;
  game.roundAuroraUsed[me.id] = true;

  game.log.push(`${me.name}使用曜彩骰【${AURORA_DICE[me.auroraDiceId].name}】，投出 ${die.label}。`);
  broadcastRoom(room);
}

function handleRerollAttack(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_reroll_or_select') return;
  if (game.attackerId !== ws.playerId) return;
  if (game.rerollsLeft <= 0) return send(ws, { type: 'error', message: '没有剩余重投次数。' });

  const attacker = getPlayerById(room, game.attackerId);
  const indices = msg.indices;

  if (!Array.isArray(indices)) return send(ws, { type: 'error', message: '重投参数无效。' });
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= game.attackDice.length) {
      return send(ws, { type: 'error', message: '重投索引无效。' });
    }
  }

  for (const idx of indices) {
    game.attackDice[idx] = rerollOneDie(game.attackDice[idx], attacker);
  }

  sortDice(game.attackDice);
  game.attackPreviewSelection = [];
  game.rerollsLeft -= 1;

  CharacterHooks.trigger('onReroll', game, attacker);

  game.log.push(`${attacker.name}重投${indices.length}枚攻击骰，结果：${diceToText(game.attackDice)}（剩余重投${game.rerollsLeft}次）`);
  broadcastRoom(room);
}

function handleConfirmAttack(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'attack_reroll_or_select') return;
  if (game.attackerId !== ws.playerId) return;

  const attacker = getPlayerById(room, game.attackerId);
  const needCount = game.attackLevel[attacker.id];
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

  CharacterHooks.trigger('onMainAttackConfirm', game, attacker, selectedDice, room);

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
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'defense_roll') return;
  if (game.defenderId !== ws.playerId) return;

  const defender = getPlayerById(room, game.defenderId);

  CharacterHooks.trigger('onDefenseRoll', game, defender);

  game.defenseDice = makeNormalDiceFromPool(game.diceSidesByPlayer[defender.id]);
  sortDice(game.defenseDice);

  game.defenseSelection = null;
  game.defensePreviewSelection = [];
  game.defenseValue = null;
  game.phase = 'defense_select';
  game.log.push(`${defender.name}投掷防守骰：${diceToText(game.defenseDice)}`);

  broadcastRoom(room);
}

function goNextRound(room, game, newAttacker, newDefender) {
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
    CharacterHooks.trigger('onRoundEnd', game, p);
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
  game.log.push(`第${game.round}回合开始，攻击方：${newAttacker.name}`);
}

function handleConfirmDefense(ws, msg) {
  const room = getPlayerRoom(ws, rooms);
  if (!room || !room.game) return;
  const game = room.game;

  if (room.status !== 'in_game' || game.phase !== 'defense_select') return;
  if (game.defenderId !== ws.playerId) return;

  const defender = getPlayerById(room, game.defenderId);
  const attacker = getPlayerById(room, game.attackerId);
  const needCount = game.defenseLevel[defender.id];
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

  CharacterHooks.trigger('onDefenseConfirm', game, defender, selectedDice, room);

  game.defenseSelection = indices;
  game.defensePreviewSelection = indices.slice();
  game.defenseValue = sumByIndices(game.defenseDice, indices);

  CharacterHooks.trigger('onMainDefenseConfirm', game, defender, selectedDice, room);

  applyAuroraAEffectOnDefense(room, game, defender, selectedDice);
  applyHackEffects(game, attacker, defender);

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
        game.log.push(`${defender.name}的【不屈】生效，生命值保留至1。`);
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
    game.log.push(`${attacker.name}发动复读追加攻击，总伤害${totalDamage}。`);
  } else {
    game.log.push(`${attacker.name}攻击${defender.name}，攻击值${game.attackValue}，防守值${game.defenseValue}，造成${totalDamage}点伤害。`);
  }

  // Track cumulative damage taken
  if (totalDamage > 0) {
    game.cumulativeDamageTaken[defender.id] += totalDamage;
  }

  // Xiadie passives
  applyXiadieDefendPassives(room, game, defender, attacker, cappedHits);

  // Trigger attacker's post-damage hooks
  CharacterHooks.trigger('onAttackAfterDamageResolved', game, attacker, totalDamage);

  // Trigger defender's post-damage hooks
  CharacterHooks.trigger('onAfterDamageResolved', game, defender, attacker, totalDamage);

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
    const need = game.defenseLevel[game.defenderId];
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
  room.waitingReason = '等待双方确认开局配置。';

  // Re-randomize AI player loadout for variety
  const hasAI = room.players.some((p) => p.ws && p.ws.isAI);
  for (const p of room.players) {
    if (p.ws && p.ws.isAI) {
      reRandomizeAIPlayer(p);
    }
  }

  // For AI rooms, reset human's aurora so they re-select in lobby
  if (hasAI) {
    for (const p of room.players) {
      if (!(p.ws && p.ws.isAI)) {
        p.auroraDiceId = null;
      }
    }
  }

  startGameIfReady(room);
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
  if (getPlayerRoom(ws, rooms)) leaveRoom(ws);

  const code = newRoomCode(rooms);
  const room = {
    code,
    status: 'lobby',
    waitingReason: '',
    players: [],
    game: null,
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
  handleCreateRoom,
  handleJoinRoom,
  handleChooseCharacter,
  handleChooseAurora,
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
