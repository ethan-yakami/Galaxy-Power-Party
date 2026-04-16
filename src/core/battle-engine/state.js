const {
  MAX_PLAYERS,
  MAX_NORMAL_DICE,
  MAX_ROLL_DICE,
  PHASE_ATTACK_ROLL,
  STATUS_IN_GAME,
  PLAYER_NONE,
  WEATHER_NONE,
  VALUE_NONE,
} = require('./constants');
const { compileCatalog } = require('./catalog/compiler');
const { hashSeed, nextInt } = require('./rng');

const STATE_SCALAR_FIELDS = Object.freeze([
  'rngState',
  'status',
  'phase',
  'round',
  'attacker',
  'defender',
  'winner',
  'rerollsLeft',
  'attackValue',
  'defenseValue',
  'lastDamage',
  'attackSelectionMask',
  'defenseSelectionMask',
  'attackPierce',
  'extraAttackQueued',
  'weatherPresetIndex',
  'weatherStageRound',
  'weatherIndex',
  'weatherEnteredRound',
  'weatherChangedRound',
  'weatherCandidateCount',
]);

const STATE_TYPED_ARRAY_FIELDS = Object.freeze([
  'weatherCandidates',
  'characterIndex',
  'auroraIndex',
  'maxAttackRerolls',
  'hp',
  'maxHp',
  'attackLevel',
  'defenseLevel',
  'normalDiceCount',
  'diceSides',
  'auroraUsesRemaining',
  'selectedFourCount',
  'selectedOneCount',
  'cumulativeDamageTaken',
  'overload',
  'desperateBonus',
  'auroraAEffectCount',
  'poison',
  'resilience',
  'thorns',
  'power',
  'xilianCumulative',
  'yaoguangRerollsUsed',
  'roundAuroraUsed',
  'forceField',
  'whiteeGuardUsed',
  'whiteeGuardActive',
  'unyielding',
  'counterActive',
  'hackActive',
  'danhengCounterReady',
  'xilianAscensionActive',
  'weatherStageAttackBonus',
  'weatherStageDefenseBonus',
  'weatherStagePowerGranted',
  'weatherPendingDefenseBonus',
  'weatherActiveDefenseBonus',
  'weatherPendingResilienceBonus',
  'weatherActiveResilienceBonus',
  'weatherAttackRerolledInRound',
]);

const ROLL_TYPED_ARRAY_FIELDS = Object.freeze([
  'values',
  'maxValues',
  'sourceKinds',
  'slotIndices',
  'auroraIndices',
  'hasA',
]);

function createRollBuffer() {
  return {
    count: 0,
    values: new Int16Array(MAX_ROLL_DICE),
    maxValues: new Int16Array(MAX_ROLL_DICE),
    sourceKinds: new Uint8Array(MAX_ROLL_DICE),
    slotIndices: new Int8Array(MAX_ROLL_DICE),
    auroraIndices: new Int8Array(MAX_ROLL_DICE),
    hasA: new Uint8Array(MAX_ROLL_DICE),
  };
}

function clearRollBuffer(roll) {
  roll.count = 0;
  roll.values.fill(0);
  roll.maxValues.fill(0);
  roll.sourceKinds.fill(0);
  roll.slotIndices.fill(-1);
  roll.auroraIndices.fill(-1);
  roll.hasA.fill(0);
}

function copyRollBuffer(src, dst) {
  dst.count = src.count;
  dst.values.set(src.values);
  dst.maxValues.set(src.maxValues);
  dst.sourceKinds.set(src.sourceKinds);
  dst.slotIndices.set(src.slotIndices);
  dst.auroraIndices.set(src.auroraIndices);
  dst.hasA.set(src.hasA);
}

function createEmptyState(catalog = compileCatalog()) {
  return {
    catalog,
    rngState: 0,
    status: STATUS_IN_GAME,
    phase: PHASE_ATTACK_ROLL,
    round: 1,
    attacker: 0,
    defender: 1,
    winner: PLAYER_NONE,
    rerollsLeft: 2,
    attackValue: VALUE_NONE,
    defenseValue: VALUE_NONE,
    lastDamage: VALUE_NONE,
    attackSelectionMask: 0,
    defenseSelectionMask: 0,
    attackPierce: 0,
    extraAttackQueued: 0,
    weatherPresetIndex: WEATHER_NONE,
    weatherStageRound: 0,
    weatherIndex: WEATHER_NONE,
    weatherEnteredRound: 0,
    weatherChangedRound: 0,
    weatherCandidateCount: 0,
    weatherCandidates: new Int16Array(16),
    characterIndex: new Int16Array(MAX_PLAYERS),
    auroraIndex: new Int16Array(MAX_PLAYERS),
    maxAttackRerolls: new Int16Array(MAX_PLAYERS),
    hp: new Int16Array(MAX_PLAYERS),
    maxHp: new Int16Array(MAX_PLAYERS),
    attackLevel: new Int16Array(MAX_PLAYERS),
    defenseLevel: new Int16Array(MAX_PLAYERS),
    normalDiceCount: new Uint8Array(MAX_PLAYERS),
    diceSides: new Int16Array(MAX_PLAYERS * MAX_NORMAL_DICE),
    auroraUsesRemaining: new Int16Array(MAX_PLAYERS),
    selectedFourCount: new Int16Array(MAX_PLAYERS),
    selectedOneCount: new Int16Array(MAX_PLAYERS),
    cumulativeDamageTaken: new Int16Array(MAX_PLAYERS),
    overload: new Int16Array(MAX_PLAYERS),
    desperateBonus: new Int16Array(MAX_PLAYERS),
    auroraAEffectCount: new Int16Array(MAX_PLAYERS),
    poison: new Int16Array(MAX_PLAYERS),
    resilience: new Int16Array(MAX_PLAYERS),
    thorns: new Int16Array(MAX_PLAYERS),
    power: new Int16Array(MAX_PLAYERS),
    xilianCumulative: new Int16Array(MAX_PLAYERS),
    yaoguangRerollsUsed: new Int16Array(MAX_PLAYERS),
    roundAuroraUsed: new Uint8Array(MAX_PLAYERS),
    forceField: new Uint8Array(MAX_PLAYERS),
    whiteeGuardUsed: new Uint8Array(MAX_PLAYERS),
    whiteeGuardActive: new Uint8Array(MAX_PLAYERS),
    unyielding: new Uint8Array(MAX_PLAYERS),
    counterActive: new Uint8Array(MAX_PLAYERS),
    hackActive: new Uint8Array(MAX_PLAYERS),
    danhengCounterReady: new Uint8Array(MAX_PLAYERS),
    xilianAscensionActive: new Uint8Array(MAX_PLAYERS),
    weatherStageAttackBonus: new Int16Array(MAX_PLAYERS),
    weatherStageDefenseBonus: new Int16Array(MAX_PLAYERS),
    weatherStagePowerGranted: new Int16Array(MAX_PLAYERS),
    weatherPendingDefenseBonus: new Int16Array(MAX_PLAYERS),
    weatherActiveDefenseBonus: new Int16Array(MAX_PLAYERS),
    weatherPendingResilienceBonus: new Int16Array(MAX_PLAYERS),
    weatherActiveResilienceBonus: new Int16Array(MAX_PLAYERS),
    weatherAttackRerolledInRound: new Uint8Array(MAX_PLAYERS),
    attackRoll: createRollBuffer(),
    defenseRoll: createRollBuffer(),
  };
}

function playerOffset(playerIndex) {
  return playerIndex * MAX_NORMAL_DICE;
}

function resetExchangeState(state) {
  state.attackSelectionMask = 0;
  state.defenseSelectionMask = 0;
  state.attackValue = VALUE_NONE;
  state.defenseValue = VALUE_NONE;
  state.lastDamage = VALUE_NONE;
  state.attackPierce = 0;
  state.extraAttackQueued = 0;
  clearRollBuffer(state.attackRoll);
  clearRollBuffer(state.defenseRoll);
}

function resetRoundFlags(state, a, b) {
  state.roundAuroraUsed[a] = 0;
  state.roundAuroraUsed[b] = 0;
  state.forceField[a] = 0;
  state.forceField[b] = 0;
  state.whiteeGuardActive[a] = 0;
  state.whiteeGuardActive[b] = 0;
  state.hackActive[a] = 0;
  state.hackActive[b] = 0;
  state.unyielding[a] = 0;
  state.unyielding[b] = 0;
  state.desperateBonus[a] = 0;
  state.desperateBonus[b] = 0;
}

function resolveAuroraIndex(catalog, character, auroraDiceId) {
  const normalizedAuroraId = typeof auroraDiceId === 'string' ? auroraDiceId.trim() : '';
  if (normalizedAuroraId) {
    const explicitIndex = catalog.auroraIndexById[normalizedAuroraId];
    if (explicitIndex != null) return explicitIndex;
    return null;
  }

  // Characters that cannot use aurora dice (auroraUses <= 0) still need
  // a catalog aurora index placeholder for engine storage compatibility.
  if ((character.auroraUses | 0) <= 0) {
    if (catalog.auroraIndexById.prime != null) return catalog.auroraIndexById.prime;
    if (Array.isArray(catalog.auroras) && catalog.auroras.length > 0) return 0;
  }
  return null;
}

function createBattle(config, seed, options = {}) {
  const catalog = options.catalog || compileCatalog();
  const hasStartingAttacker = Number.isInteger(options.startingAttacker) && options.startingAttacker >= 0 && options.startingAttacker < 2;
  if (!config || !Array.isArray(config.players) || config.players.length !== 2) {
    throw new Error('createBattle requires exactly 2 players.');
  }

  const state = createEmptyState(catalog);
  state.rngState = hashSeed(seed);
  if (typeof options.weatherPresetId === 'string' && options.weatherPresetId.trim()) {
    const weatherIndex = catalog.weatherIndexById[options.weatherPresetId.trim()];
    if (weatherIndex != null) {
      state.weatherPresetIndex = weatherIndex;
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const player = config.players[i];
    const characterIdx = catalog.characterIndexById[player.characterId];
    if (characterIdx == null) throw new Error(`Unknown character: ${player.characterId}`);
    const character = catalog.characters[characterIdx];
    const auroraIdx = resolveAuroraIndex(catalog, character, player.auroraDiceId);
    if (auroraIdx == null) throw new Error(`Unknown aurora: ${player.auroraDiceId}`);

    state.characterIndex[i] = characterIdx;
    state.auroraIndex[i] = auroraIdx;
    state.maxAttackRerolls[i] = character.maxAttackRerolls;
    state.hp[i] = character.hp;
    state.maxHp[i] = character.hp;
    state.attackLevel[i] = character.attackLevel;
    state.defenseLevel[i] = character.defenseLevel;
    state.normalDiceCount[i] = character.diceSides.length;
    state.auroraUsesRemaining[i] = character.auroraUses;

    const offset = playerOffset(i);
    for (let j = 0; j < MAX_NORMAL_DICE; j += 1) {
      state.diceSides[offset + j] = character.diceSides[j] || 0;
    }
  }

  state.attacker = hasStartingAttacker ? options.startingAttacker : nextInt(state, 2);
  state.defender = state.attacker === 0 ? 1 : 0;
  return state;
}

function cloneState(src, dst) {
  const target = dst || createEmptyState(src.catalog);
  target.catalog = src.catalog;
  for (const field of STATE_SCALAR_FIELDS) {
    target[field] = src[field];
  }
  for (const field of STATE_TYPED_ARRAY_FIELDS) {
    target[field].set(src[field]);
  }
  copyRollBuffer(src.attackRoll, target.attackRoll);
  copyRollBuffer(src.defenseRoll, target.defenseRoll);
  return target;
}

function serializeRoll(roll) {
  const out = { count: roll.count };
  for (const field of ROLL_TYPED_ARRAY_FIELDS) {
    out[field] = Array.from(roll[field]);
  }
  return out;
}

function serializeState(state) {
  const out = {};
  for (const field of STATE_SCALAR_FIELDS) {
    out[field] = state[field];
  }
  for (const field of STATE_TYPED_ARRAY_FIELDS) {
    out[field] = Array.from(state[field]);
  }
  out.attackRoll = serializeRoll(state.attackRoll);
  out.defenseRoll = serializeRoll(state.defenseRoll);
  return out;
}

function deserializeRoll(snapshot, roll) {
  roll.count = snapshot.count;
  for (const field of ROLL_TYPED_ARRAY_FIELDS) {
    roll[field].set(snapshot[field]);
  }
}

function deserializeState(snapshot, dst, options = {}) {
  const catalog = options.catalog || compileCatalog();
  const state = dst || createEmptyState(catalog);
  state.catalog = catalog;
  for (const field of STATE_SCALAR_FIELDS) {
    if (field === 'rngState') {
      state.rngState = snapshot.rngState >>> 0;
    } else if (field === 'weatherPresetIndex') {
      state.weatherPresetIndex = snapshot.weatherPresetIndex == null ? WEATHER_NONE : snapshot.weatherPresetIndex;
    } else {
      state[field] = snapshot[field];
    }
  }
  for (const field of STATE_TYPED_ARRAY_FIELDS) {
    state[field].set(snapshot[field]);
  }
  deserializeRoll(snapshot.attackRoll, state.attackRoll);
  deserializeRoll(snapshot.defenseRoll, state.defenseRoll);
  return state;
}

module.exports = {
  createBattle,
  createEmptyState,
  cloneState,
  serializeState,
  deserializeState,
  createRollBuffer,
  clearRollBuffer,
  copyRollBuffer,
  resetExchangeState,
  resetRoundFlags,
  playerOffset,
};
