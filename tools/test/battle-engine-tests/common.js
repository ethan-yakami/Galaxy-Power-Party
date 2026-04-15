const assert = require('assert');
const WebSocket = require('ws');

const createHandlers = require('../../../src/server/app/handlers');
const engine = require('../../../src/core/battle-engine');
const { scheduleAIAction } = require('../../../src/server/ai');
const { hashSeed, nextFloat } = require('../../../src/core/battle-engine/rng');
const {
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_SELECT,
  STATUS_ENDED,
  SOURCE_NORMAL,
  SOURCE_AURORA,
} = require('../../../src/core/battle-engine/constants');

function makeWs(id) {
  return {
    playerId: id,
    playerRoomCode: null,
    reconnectToken: `${id}_token`,
    readyState: WebSocket.OPEN,
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
}

function highestIndices(dice, count) {
  return dice
    .map((die, index) => ({ index, value: die.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((item) => item.index);
}

function createProjectionUi() {
  return {
    indexToPlayerId: ['P1', 'P2'],
    attackPreviewMask: 0,
    defensePreviewMask: 0,
    logs: [],
    effectEvents: [],
  };
}

function setRollBuffer(roll, entries) {
  roll.count = entries.length;
  for (let i = 0; i < 6; i += 1) {
    roll.values[i] = 0;
    roll.maxValues[i] = 0;
    roll.sourceKinds[i] = SOURCE_NORMAL;
    roll.slotIndices[i] = -1;
    roll.auroraIndices[i] = -1;
    roll.hasA[i] = 0;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    roll.values[i] = entry.value;
    roll.maxValues[i] = entry.maxValue == null ? entry.value : entry.maxValue;
    roll.sourceKinds[i] = entry.isAurora ? SOURCE_AURORA : SOURCE_NORMAL;
    roll.slotIndices[i] = entry.isAurora ? -1 : (entry.slotIndex == null ? i : entry.slotIndex);
    roll.auroraIndices[i] = entry.auroraIndex == null ? -1 : entry.auroraIndex;
    roll.hasA[i] = entry.hasA ? 1 : 0;
  }
}

function makeLegacyDie(value, maxValue, options = {}) {
  return {
    value,
    label: options.hasA ? `${value}A` : `${value}`,
    hasA: !!options.hasA,
    isAurora: !!options.isAurora,
    sides: options.isAurora ? null : maxValue,
    maxValue,
    slotId: options.isAurora ? null : (options.slotId == null ? 0 : options.slotId),
    auroraId: options.auroraId || null,
    auroraName: options.auroraName || null,
    effectText: null,
    conditionText: null,
  };
}

function createStartedLegacyRoom(playerA, playerB) {
  const rooms = new Map();
  const handlers = createHandlers(rooms);
  const a = makeWs('P1');
  const b = makeWs('P2');

  handlers.handleCreateRoom(a, { name: 'A' });
  handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
  handlers.handleChooseCharacter(a, { characterId: playerA.characterId });
  handlers.handleChooseAurora(a, { auroraDiceId: playerA.auroraDiceId });
  handlers.handleChooseCharacter(b, { characterId: playerB.characterId });
  handlers.handleChooseAurora(b, { auroraDiceId: playerB.auroraDiceId });

  return { room: rooms.get(a.playerRoomCode), handlers, a, b };
}

function findWsByPlayerId(a, b, playerId) {
  if (a.playerId === playerId) return a;
  if (b.playerId === playerId) return b;
  throw new Error(`Unknown player id: ${playerId}`);
}

function drivePureGameToEnd(room, handlers, a, b, maxSteps = 400) {
  let steps = 0;
  while (room && room.game && room.game.status !== 'ended' && steps < maxSteps) {
    const game = room.game;
    if (game.phase === 'attack_roll') {
      handlers.handleRollAttack(findWsByPlayerId(a, b, game.attackerId));
    } else if (game.phase === 'attack_reroll_or_select') {
      const attackerWs = findWsByPlayerId(a, b, game.attackerId);
      const need = game.attackLevel[game.attackerId];
      handlers.handleConfirmAttack(attackerWs, { indices: highestIndices(game.attackDice, need) });
    } else if (game.phase === 'defense_roll') {
      handlers.handleRollDefense(findWsByPlayerId(a, b, game.defenderId));
    } else if (game.phase === 'defense_select') {
      const defenderWs = findWsByPlayerId(a, b, game.defenderId);
      const need = game.defenseLevel[game.defenderId];
      handlers.handleConfirmDefense(defenderWs, { indices: highestIndices(game.defenseDice, need) });
    } else {
      throw new Error(`Unexpected phase while driving pure game: ${game.phase}`);
    }
    steps += 1;
  }
  assert(room && room.game, 'room/game should exist');
  assert.strictEqual(room.game.status, 'ended', 'pure game should finish before max steps');
}

function withSeededRandom(seed, fn) {
  const originalRandom = Math.random;
  const seeded = { rngState: hashSeed(seed) };
  Math.random = () => nextFloat(seeded);
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function withImmediateTimers(fn) {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback) => {
    callback();
    return 0;
  };
  global.clearTimeout = () => {};
  try {
    return fn();
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

module.exports = {
  assert,
  createHandlers,
  engine,
  scheduleAIAction,
  hashSeed,
  nextFloat,
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_SELECT,
  STATUS_ENDED,
  SOURCE_NORMAL,
  SOURCE_AURORA,
  makeWs,
  highestIndices,
  createProjectionUi,
  setRollBuffer,
  makeLegacyDie,
  createStartedLegacyRoom,
  findWsByPlayerId,
  drivePureGameToEnd,
  withSeededRandom,
  withImmediateTimers,
};


