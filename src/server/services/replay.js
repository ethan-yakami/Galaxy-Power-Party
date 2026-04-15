const {
  getActionMask,
  getActionOpcode,
  PHASE_NAMES,
  serializeState,
  OPCODES,
} = require('../../core/battle-engine');
const { STATUS_ENDED } = require('../../core/battle-engine/constants');
const replaySchema = require('../../core/shared/replay-schema');
const { buildMatchRecordFromReplay } = require('./match-record');

const ACTION_CODE_BY_OPCODE = Object.freeze({
  [OPCODES.ROLL_ATTACK]: 'roll_attack',
  [OPCODES.USE_AURORA_ATTACK]: 'use_aurora_attack',
  [OPCODES.REROLL_ATTACK]: 'reroll_attack',
  [OPCODES.CONFIRM_ATTACK]: 'confirm_attack_selection',
  [OPCODES.ROLL_DEFENSE]: 'roll_defense',
  [OPCODES.USE_AURORA_DEFENSE]: 'use_aurora_defense',
  [OPCODES.CONFIRM_DEFENSE]: 'confirm_defense_selection',
});

function phaseName(phase) {
  return PHASE_NAMES[phase] || 'unknown_phase';
}

function statusName(status) {
  return status === STATUS_ENDED ? 'ended' : 'in_game';
}

function indicesFromMask(mask) {
  const out = [];
  const value = mask >>> 0;
  for (let bit = 0; bit < 6; bit += 1) {
    if ((value >>> bit) & 1) out.push(bit);
  }
  return out;
}

function resolveWinnerPlayerId(room) {
  if (!room || !room.engineState || !Array.isArray(room.players)) return null;
  const winnerIndex = room.engineState.winner;
  if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= room.players.length) return null;
  const winner = room.players[winnerIndex];
  return winner ? winner.id : null;
}

function buildPlayersLoadout(room) {
  return room.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    characterId: player.characterId,
    auroraDiceId: player.auroraDiceId,
  }));
}

function cloneDiceList(diceList) {
  if (!Array.isArray(diceList)) return [];
  return diceList.map((die) => {
    if (!die || typeof die !== 'object') return null;
    return {
      value: Number.isFinite(die.value) ? die.value : 0,
      label: typeof die.label === 'string' ? die.label : '',
      hasA: !!die.hasA,
      isAurora: !!die.isAurora,
      maxValue: Number.isFinite(die.maxValue) ? die.maxValue : 0,
      auroraId: die.auroraId || null,
    };
  });
}

function cloneIndexList(indices) {
  if (!Array.isArray(indices)) return [];
  return indices.filter((idx) => Number.isInteger(idx));
}

function cloneNumberMapByPlayers(room, sourceMap) {
  const out = {};
  if (!sourceMap || typeof sourceMap !== 'object') return out;
  for (const player of room.players) {
    const value = sourceMap[player.id];
    out[player.id] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

function buildReplayView(room) {
  const game = room && room.game;
  if (!game || typeof game !== 'object') return null;
  const players = room.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    characterId: player.characterId,
    auroraDiceId: player.auroraDiceId,
    hp: game.hp && Number.isFinite(game.hp[player.id]) ? game.hp[player.id] : null,
    maxHp: game.maxHp && Number.isFinite(game.maxHp[player.id]) ? game.maxHp[player.id] : null,
  }));
  return {
    status: game.status || '',
    round: Number.isFinite(game.round) ? game.round : 0,
    phase: game.phase || '',
    attackerId: game.attackerId || null,
    defenderId: game.defenderId || null,
    winnerId: game.winnerId || null,
    attackValue: Number.isFinite(game.attackValue) ? game.attackValue : null,
    defenseValue: Number.isFinite(game.defenseValue) ? game.defenseValue : null,
    lastDamage: Number.isFinite(game.lastDamage) ? game.lastDamage : null,
    hp: cloneNumberMapByPlayers(room, game.hp),
    attackSelection: cloneIndexList(game.attackSelection),
    defenseSelection: cloneIndexList(game.defenseSelection),
    attackDice: cloneDiceList(game.attackDice),
    defenseDice: cloneDiceList(game.defenseDice),
    attackLevel: cloneNumberMapByPlayers(room, game.attackLevel),
    defenseLevel: cloneNumberMapByPlayers(room, game.defenseLevel),
    auroraUsesRemaining: cloneNumberMapByPlayers(room, game.auroraUsesRemaining),
    selectedFourCount: cloneNumberMapByPlayers(room, game.selectedFourCount),
    selectedOneCount: cloneNumberMapByPlayers(room, game.selectedOneCount),
    cumulativeDamageTaken: cloneNumberMapByPlayers(room, game.cumulativeDamageTaken),
    overload: cloneNumberMapByPlayers(room, game.overload),
    desperateBonus: cloneNumberMapByPlayers(room, game.desperateBonus),
    auroraAEffectCount: cloneNumberMapByPlayers(room, game.auroraAEffectCount),
    poison: cloneNumberMapByPlayers(room, game.poison),
    resilience: cloneNumberMapByPlayers(room, game.resilience),
    thorns: cloneNumberMapByPlayers(room, game.thorns),
    power: cloneNumberMapByPlayers(room, game.power),
    xilianCumulative: cloneNumberMapByPlayers(room, game.xilianCumulative),
    yaoguangRerollsUsed: cloneNumberMapByPlayers(room, game.yaoguangRerollsUsed),
    roundAuroraUsed: game.roundAuroraUsed && typeof game.roundAuroraUsed === 'object'
      ? JSON.parse(JSON.stringify(game.roundAuroraUsed))
      : {},
    forceField: game.forceField && typeof game.forceField === 'object'
      ? JSON.parse(JSON.stringify(game.forceField))
      : {},
    hackActive: game.hackActive && typeof game.hackActive === 'object'
      ? JSON.parse(JSON.stringify(game.hackActive))
      : {},
    danhengCounterReady: game.danhengCounterReady && typeof game.danhengCounterReady === 'object'
      ? JSON.parse(JSON.stringify(game.danhengCounterReady))
      : {},
    xilianAscensionActive: game.xilianAscensionActive && typeof game.xilianAscensionActive === 'object'
      ? JSON.parse(JSON.stringify(game.xilianAscensionActive))
      : {},
    whiteeGuardUsed: game.whiteeGuardUsed && typeof game.whiteeGuardUsed === 'object'
      ? JSON.parse(JSON.stringify(game.whiteeGuardUsed))
      : {},
    whiteeGuardActive: game.whiteeGuardActive && typeof game.whiteeGuardActive === 'object'
      ? JSON.parse(JSON.stringify(game.whiteeGuardActive))
      : {},
    unyielding: game.unyielding && typeof game.unyielding === 'object'
      ? JSON.parse(JSON.stringify(game.unyielding))
      : {},
    counterActive: game.counterActive && typeof game.counterActive === 'object'
      ? JSON.parse(JSON.stringify(game.counterActive))
      : {},
    weather: game.weather && typeof game.weather === 'object'
      ? JSON.parse(JSON.stringify(game.weather))
      : null,
    logTail: Array.isArray(game.log) ? game.log.slice(-10) : [],
    players,
  };
}

function createReplayId(room, options = {}) {
  const roomCode = room && room.code ? room.code : 'room';
  const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : Date.now();
  const seed = options.seed || '';
  return `${replaySchema.REPLAY_FILE_PREFIX}:${roomCode}:${startedAt}:${seed}`;
}

function createReplayV1(room, options = {}) {
  const startedAt = Date.now();
  const replayId = createReplayId(room, { startedAt, seed: options.seed });
  return {
    replayId,
    version: replaySchema.REPLAY_VERSION,
    engineMode: room.engineMode || 'pure',
    protocolModel: typeof options.protocolModel === 'string' && options.protocolModel
      ? options.protocolModel
      : 'action_ticket',
    seed: String(options.seed || ''),
    roomMeta: {
      roomCode: room.code || '',
      startedAt,
      startingAttacker: Number.isInteger(options.startingAttacker) ? options.startingAttacker : null,
      endedAt: null,
      resumedFromReplayId: typeof options.resumedFromReplayId === 'string' ? options.resumedFromReplayId : null,
      resumedFromStep: Number.isInteger(options.resumedFromStep) ? options.resumedFromStep : null,
      roomMode: typeof room.roomMode === 'string' ? room.roomMode : 'standard',
    },
    playersLoadout: buildPlayersLoadout(room),
    actions: [],
    stepDetails: [],
    snapshots: [],
    result: {
      winnerPlayerId: null,
      rounds: room.engineState ? room.engineState.round : 0,
      endedReason: '',
      endedAt: null,
    },
    matchRecord: null,
  };
}

function appendReplaySnapshot(room, replay, reason, step) {
  if (!room || !room.engineState || !replay) return;
  replay.snapshots.push({
    step: Number.isInteger(step) ? step : replay.actions.length,
    reason: reason || 'snapshot',
    timestamp: Date.now(),
    round: room.engineState.round,
    phase: phaseName(room.engineState.phase),
    status: statusName(room.engineState.status),
    winnerPlayerId: resolveWinnerPlayerId(room),
    state: serializeState(room.engineState),
    view: buildReplayView(room),
  });
}

function appendReplayAction(room, replay, action, context = {}) {
  if (!room || !room.engineState || !replay) return;
  const actionRecord = (action && typeof action === 'object') ? action : { encodedAction: action };
  const encodedAction = Number.isInteger(actionRecord.encodedAction)
    ? actionRecord.encodedAction
    : 0;
  const opcode = getActionOpcode(encodedAction);
  const mask = getActionMask(encodedAction);
  const step = replay.actions.length + 1;
  replay.actions.push({
    step,
    actor: context.actorId || '',
    phaseBefore: phaseName(context.phaseBefore),
    actionCode: ACTION_CODE_BY_OPCODE[opcode] || `opcode_${opcode}`,
    opcode,
    actionMask: mask,
    indices: indicesFromMask(mask),
    encodedAction,
    turnId: Number.isInteger(actionRecord.turnId) ? actionRecord.turnId : null,
    actionId: typeof actionRecord.actionId === 'string' ? actionRecord.actionId : '',
    actionSnapshotHash: typeof actionRecord.actionSnapshotHash === 'string' ? actionRecord.actionSnapshotHash : '',
    mutationLog: actionRecord.mutationLog && typeof actionRecord.mutationLog === 'object'
      ? JSON.parse(JSON.stringify(actionRecord.mutationLog))
      : null,
    timestamp: Date.now(),
  });
  return step;
}

function appendStepDetail(room, replay, step, context = {}) {
  if (!room || !room.engineState || !replay) return;
  replay.stepDetails.push({
    step,
    actionOutcome: {
      ok: context.actionOutcome ? context.actionOutcome.ok !== false : true,
      reason: context.actionOutcome && typeof context.actionOutcome.reason === 'string' ? context.actionOutcome.reason : '',
      phase: context.actionOutcome && typeof context.actionOutcome.phase === 'string' ? context.actionOutcome.phase : phaseName(room.engineState.phase),
      status: context.actionOutcome && typeof context.actionOutcome.status === 'string' ? context.actionOutcome.status : statusName(room.engineState.status),
      winner: context.actionOutcome && Number.isInteger(context.actionOutcome.winner) ? context.actionOutcome.winner : null,
      weatherChangedRound: context.actionOutcome && Number.isFinite(context.actionOutcome.weatherChangedRound)
        ? context.actionOutcome.weatherChangedRound
        : null,
    },
    logsAdded: Array.isArray(context.logsAdded) ? context.logsAdded.slice() : [],
    effectsAdded: Array.isArray(context.effectsAdded) ? JSON.parse(JSON.stringify(context.effectsAdded)) : [],
    phaseBefore: phaseName(context.phaseBefore),
    phaseAfter: phaseName(room.engineState.phase),
    roundBefore: Number.isFinite(context.roundBefore) ? context.roundBefore : room.engineState.round,
    roundAfter: room.engineState.round,
    winnerAfter: Number.isInteger(room.engineState.winner) ? room.engineState.winner : null,
  });
}

function updateReplayResult(room, replay, endedReason) {
  if (!room || !room.engineState || !replay) return;
  replay.result.rounds = room.engineState.round;
  replay.result.winnerPlayerId = resolveWinnerPlayerId(room);
  if (room.engineState.status === STATUS_ENDED) {
    replay.result.endedAt = Date.now();
    replay.result.endedReason = endedReason || replay.result.endedReason || 'normal_end';
    replay.roomMeta.endedAt = replay.result.endedAt;
  }
  replay.matchRecord = buildMatchRecordFromReplay(replay);
}

function recordPureActionReplay(room, action, context = {}) {
  if (!room || !room.engineState || !room.replay) return;

  const step = appendReplayAction(room, room.replay, action, context);
  appendStepDetail(room, room.replay, step, context);

  const reasons = [];
  if (Number.isInteger(context.phaseBefore) && context.phaseBefore !== room.engineState.phase) {
    reasons.push(`phase:${phaseName(context.phaseBefore)}->${phaseName(room.engineState.phase)}`);
  }
  if (Number.isInteger(context.roundBefore) && context.roundBefore !== room.engineState.round) {
    reasons.push(`round:${context.roundBefore}->${room.engineState.round}`);
  }
  if (Number.isInteger(context.statusBefore) && context.statusBefore !== room.engineState.status) {
    reasons.push(`status:${statusName(context.statusBefore)}->${statusName(room.engineState.status)}`);
  }
  if (
    Number.isInteger(context.winnerBefore)
    && context.winnerBefore !== room.engineState.winner
    && room.engineState.winner >= 0
  ) {
    reasons.push('winner_updated');
  }

  const snapshotReason = reasons.length > 0 ? reasons.join(', ') : 'step';
  appendReplaySnapshot(room, room.replay, snapshotReason, room.replay.actions.length);
  updateReplayResult(room, room.replay);
}

function finalizeReplay(room, endedReason) {
  if (!room || !room.replay || !room.engineState) return;
  const lastSnapshot = room.replay.snapshots[room.replay.snapshots.length - 1];
  if (!lastSnapshot || lastSnapshot.step !== room.replay.actions.length) {
    appendReplaySnapshot(room, room.replay, endedReason || 'finalize', room.replay.actions.length);
  }
  updateReplayResult(room, room.replay, endedReason || 'normal_end');
}

function buildReplayExportPayload(room) {
  if (!room || !room.replay) return null;
  updateReplayResult(room, room.replay);
  return JSON.parse(JSON.stringify(room.replay));
}

function exportReplay(room) {
  return buildReplayExportPayload(room);
}

function buildReplayFileName(room) {
  const code = room && room.code ? room.code : 'room';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${replaySchema.REPLAY_FILE_PREFIX}-${code}-${stamp}.json`;
}

module.exports = {
  replaySchema,
  createReplayV1,
  appendReplaySnapshot,
  recordPureActionReplay,
  finalizeReplay,
  exportReplay,
  buildReplayExportPayload,
  buildReplayFileName,
};

