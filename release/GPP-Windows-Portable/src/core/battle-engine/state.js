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
    const auroraIdx = catalog.auroraIndexById[player.auroraDiceId];
    if (characterIdx == null) throw new Error(`Unknown character: ${player.characterId}`);
    if (auroraIdx == null) throw new Error(`Unknown aurora: ${player.auroraDiceId}`);

    const character = catalog.characters[characterIdx];
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
  target.rngState = src.rngState;
  target.status = src.status;
  target.phase = src.phase;
  target.round = src.round;
  target.attacker = src.attacker;
  target.defender = src.defender;
  target.winner = src.winner;
  target.rerollsLeft = src.rerollsLeft;
  target.attackValue = src.attackValue;
  target.defenseValue = src.defenseValue;
  target.lastDamage = src.lastDamage;
  target.attackSelectionMask = src.attackSelectionMask;
  target.defenseSelectionMask = src.defenseSelectionMask;
  target.attackPierce = src.attackPierce;
  target.extraAttackQueued = src.extraAttackQueued;
  target.weatherPresetIndex = src.weatherPresetIndex;
  target.weatherStageRound = src.weatherStageRound;
  target.weatherIndex = src.weatherIndex;
  target.weatherEnteredRound = src.weatherEnteredRound;
  target.weatherChangedRound = src.weatherChangedRound;
  target.weatherCandidateCount = src.weatherCandidateCount;
  target.weatherCandidates.set(src.weatherCandidates);
  target.characterIndex.set(src.characterIndex);
  target.auroraIndex.set(src.auroraIndex);
  target.maxAttackRerolls.set(src.maxAttackRerolls);
  target.hp.set(src.hp);
  target.maxHp.set(src.maxHp);
  target.attackLevel.set(src.attackLevel);
  target.defenseLevel.set(src.defenseLevel);
  target.normalDiceCount.set(src.normalDiceCount);
  target.diceSides.set(src.diceSides);
  target.auroraUsesRemaining.set(src.auroraUsesRemaining);
  target.selectedFourCount.set(src.selectedFourCount);
  target.selectedOneCount.set(src.selectedOneCount);
  target.cumulativeDamageTaken.set(src.cumulativeDamageTaken);
  target.overload.set(src.overload);
  target.desperateBonus.set(src.desperateBonus);
  target.auroraAEffectCount.set(src.auroraAEffectCount);
  target.poison.set(src.poison);
  target.resilience.set(src.resilience);
  target.thorns.set(src.thorns);
  target.power.set(src.power);
  target.xilianCumulative.set(src.xilianCumulative);
  target.yaoguangRerollsUsed.set(src.yaoguangRerollsUsed);
  target.roundAuroraUsed.set(src.roundAuroraUsed);
  target.forceField.set(src.forceField);
  target.whiteeGuardUsed.set(src.whiteeGuardUsed);
  target.whiteeGuardActive.set(src.whiteeGuardActive);
  target.unyielding.set(src.unyielding);
  target.counterActive.set(src.counterActive);
  target.hackActive.set(src.hackActive);
  target.danhengCounterReady.set(src.danhengCounterReady);
  target.xilianAscensionActive.set(src.xilianAscensionActive);
  target.weatherStageAttackBonus.set(src.weatherStageAttackBonus);
  target.weatherStageDefenseBonus.set(src.weatherStageDefenseBonus);
  target.weatherStagePowerGranted.set(src.weatherStagePowerGranted);
  target.weatherPendingDefenseBonus.set(src.weatherPendingDefenseBonus);
  target.weatherActiveDefenseBonus.set(src.weatherActiveDefenseBonus);
  target.weatherPendingResilienceBonus.set(src.weatherPendingResilienceBonus);
  target.weatherActiveResilienceBonus.set(src.weatherActiveResilienceBonus);
  target.weatherAttackRerolledInRound.set(src.weatherAttackRerolledInRound);
  copyRollBuffer(src.attackRoll, target.attackRoll);
  copyRollBuffer(src.defenseRoll, target.defenseRoll);
  return target;
}

function serializeRoll(roll) {
  return {
    count: roll.count,
    values: Array.from(roll.values),
    maxValues: Array.from(roll.maxValues),
    sourceKinds: Array.from(roll.sourceKinds),
    slotIndices: Array.from(roll.slotIndices),
    auroraIndices: Array.from(roll.auroraIndices),
    hasA: Array.from(roll.hasA),
  };
}

function serializeState(state) {
  return {
    rngState: state.rngState,
    status: state.status,
    phase: state.phase,
    round: state.round,
    attacker: state.attacker,
    defender: state.defender,
    winner: state.winner,
    rerollsLeft: state.rerollsLeft,
    attackValue: state.attackValue,
    defenseValue: state.defenseValue,
    lastDamage: state.lastDamage,
    attackSelectionMask: state.attackSelectionMask,
    defenseSelectionMask: state.defenseSelectionMask,
    attackPierce: state.attackPierce,
    extraAttackQueued: state.extraAttackQueued,
    weatherPresetIndex: state.weatherPresetIndex,
    weatherStageRound: state.weatherStageRound,
    weatherIndex: state.weatherIndex,
    weatherEnteredRound: state.weatherEnteredRound,
    weatherChangedRound: state.weatherChangedRound,
    weatherCandidateCount: state.weatherCandidateCount,
    weatherCandidates: Array.from(state.weatherCandidates),
    characterIndex: Array.from(state.characterIndex),
    auroraIndex: Array.from(state.auroraIndex),
    maxAttackRerolls: Array.from(state.maxAttackRerolls),
    hp: Array.from(state.hp),
    maxHp: Array.from(state.maxHp),
    attackLevel: Array.from(state.attackLevel),
    defenseLevel: Array.from(state.defenseLevel),
    normalDiceCount: Array.from(state.normalDiceCount),
    diceSides: Array.from(state.diceSides),
    auroraUsesRemaining: Array.from(state.auroraUsesRemaining),
    selectedFourCount: Array.from(state.selectedFourCount),
    selectedOneCount: Array.from(state.selectedOneCount),
    cumulativeDamageTaken: Array.from(state.cumulativeDamageTaken),
    overload: Array.from(state.overload),
    desperateBonus: Array.from(state.desperateBonus),
    auroraAEffectCount: Array.from(state.auroraAEffectCount),
    poison: Array.from(state.poison),
    resilience: Array.from(state.resilience),
    thorns: Array.from(state.thorns),
    power: Array.from(state.power),
    xilianCumulative: Array.from(state.xilianCumulative),
    yaoguangRerollsUsed: Array.from(state.yaoguangRerollsUsed),
    roundAuroraUsed: Array.from(state.roundAuroraUsed),
    forceField: Array.from(state.forceField),
    whiteeGuardUsed: Array.from(state.whiteeGuardUsed),
    whiteeGuardActive: Array.from(state.whiteeGuardActive),
    unyielding: Array.from(state.unyielding),
    counterActive: Array.from(state.counterActive),
    hackActive: Array.from(state.hackActive),
    danhengCounterReady: Array.from(state.danhengCounterReady),
    xilianAscensionActive: Array.from(state.xilianAscensionActive),
    weatherStageAttackBonus: Array.from(state.weatherStageAttackBonus),
    weatherStageDefenseBonus: Array.from(state.weatherStageDefenseBonus),
    weatherStagePowerGranted: Array.from(state.weatherStagePowerGranted),
    weatherPendingDefenseBonus: Array.from(state.weatherPendingDefenseBonus),
    weatherActiveDefenseBonus: Array.from(state.weatherActiveDefenseBonus),
    weatherPendingResilienceBonus: Array.from(state.weatherPendingResilienceBonus),
    weatherActiveResilienceBonus: Array.from(state.weatherActiveResilienceBonus),
    weatherAttackRerolledInRound: Array.from(state.weatherAttackRerolledInRound),
    attackRoll: serializeRoll(state.attackRoll),
    defenseRoll: serializeRoll(state.defenseRoll),
  };
}

function deserializeRoll(snapshot, roll) {
  roll.count = snapshot.count;
  roll.values.set(snapshot.values);
  roll.maxValues.set(snapshot.maxValues);
  roll.sourceKinds.set(snapshot.sourceKinds);
  roll.slotIndices.set(snapshot.slotIndices);
  roll.auroraIndices.set(snapshot.auroraIndices);
  roll.hasA.set(snapshot.hasA);
}

function deserializeState(snapshot, dst, options = {}) {
  const catalog = options.catalog || compileCatalog();
  const state = dst || createEmptyState(catalog);
  state.catalog = catalog;
  state.rngState = snapshot.rngState >>> 0;
  state.status = snapshot.status;
  state.phase = snapshot.phase;
  state.round = snapshot.round;
  state.attacker = snapshot.attacker;
  state.defender = snapshot.defender;
  state.winner = snapshot.winner;
  state.rerollsLeft = snapshot.rerollsLeft;
  state.attackValue = snapshot.attackValue;
  state.defenseValue = snapshot.defenseValue;
  state.lastDamage = snapshot.lastDamage;
  state.attackSelectionMask = snapshot.attackSelectionMask;
  state.defenseSelectionMask = snapshot.defenseSelectionMask;
  state.attackPierce = snapshot.attackPierce;
  state.extraAttackQueued = snapshot.extraAttackQueued;
  state.weatherPresetIndex = snapshot.weatherPresetIndex == null ? WEATHER_NONE : snapshot.weatherPresetIndex;
  state.weatherStageRound = snapshot.weatherStageRound;
  state.weatherIndex = snapshot.weatherIndex;
  state.weatherEnteredRound = snapshot.weatherEnteredRound;
  state.weatherChangedRound = snapshot.weatherChangedRound;
  state.weatherCandidateCount = snapshot.weatherCandidateCount;
  state.weatherCandidates.set(snapshot.weatherCandidates);
  state.characterIndex.set(snapshot.characterIndex);
  state.auroraIndex.set(snapshot.auroraIndex);
  state.maxAttackRerolls.set(snapshot.maxAttackRerolls);
  state.hp.set(snapshot.hp);
  state.maxHp.set(snapshot.maxHp);
  state.attackLevel.set(snapshot.attackLevel);
  state.defenseLevel.set(snapshot.defenseLevel);
  state.normalDiceCount.set(snapshot.normalDiceCount);
  state.diceSides.set(snapshot.diceSides);
  state.auroraUsesRemaining.set(snapshot.auroraUsesRemaining);
  state.selectedFourCount.set(snapshot.selectedFourCount);
  state.selectedOneCount.set(snapshot.selectedOneCount);
  state.cumulativeDamageTaken.set(snapshot.cumulativeDamageTaken);
  state.overload.set(snapshot.overload);
  state.desperateBonus.set(snapshot.desperateBonus);
  state.auroraAEffectCount.set(snapshot.auroraAEffectCount);
  state.poison.set(snapshot.poison);
  state.resilience.set(snapshot.resilience);
  state.thorns.set(snapshot.thorns);
  state.power.set(snapshot.power);
  state.xilianCumulative.set(snapshot.xilianCumulative);
  state.yaoguangRerollsUsed.set(snapshot.yaoguangRerollsUsed);
  state.roundAuroraUsed.set(snapshot.roundAuroraUsed);
  state.forceField.set(snapshot.forceField);
  state.whiteeGuardUsed.set(snapshot.whiteeGuardUsed);
  state.whiteeGuardActive.set(snapshot.whiteeGuardActive);
  state.unyielding.set(snapshot.unyielding);
  state.counterActive.set(snapshot.counterActive);
  state.hackActive.set(snapshot.hackActive);
  state.danhengCounterReady.set(snapshot.danhengCounterReady);
  state.xilianAscensionActive.set(snapshot.xilianAscensionActive);
  state.weatherStageAttackBonus.set(snapshot.weatherStageAttackBonus);
  state.weatherStageDefenseBonus.set(snapshot.weatherStageDefenseBonus);
  state.weatherStagePowerGranted.set(snapshot.weatherStagePowerGranted);
  state.weatherPendingDefenseBonus.set(snapshot.weatherPendingDefenseBonus);
  state.weatherActiveDefenseBonus.set(snapshot.weatherActiveDefenseBonus);
  state.weatherPendingResilienceBonus.set(snapshot.weatherPendingResilienceBonus);
  state.weatherActiveResilienceBonus.set(snapshot.weatherActiveResilienceBonus);
  state.weatherAttackRerolledInRound.set(snapshot.weatherAttackRerolledInRound);
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
