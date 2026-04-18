const {
  projectStateToLegacyRoom,
  cloneState,
  applyActionInPlace,
  getActionOpcode,
  getActionMask,
  OPCODES,
} = require('../../core/battle-engine');
const {
  characterAiScoreAttack,
  characterAiScoreDefense,
} = require('../services/registry');
const {
  DEFAULT_MODEL_SCALE,
  VALUE_MODEL_VERSION,
  getDifficultyConfig,
} = require('./config');
const { loadValueModel, predictStateValue } = require('./model/runtime');
const FEATURE_ORDER = require('./model/feature-order.json');

const WEATHER_STAGE_ROUNDS = [2, 4, 6, 8];

const WEATHER_PROFILE = Object.freeze({
  frost: Object.freeze({ typeCode: 2, tempo: 2, comeback: 4 }),
  frog_rain: Object.freeze({ typeCode: 2, tempo: 1, comeback: 2 }),
  light_snow: Object.freeze({ typeCode: 2, tempo: -1, comeback: 8 }),
  fish_rain: Object.freeze({ typeCode: 2, tempo: 4, comeback: 1 }),
  illusion_sun: Object.freeze({ typeCode: 1, tempo: 8, comeback: 3 }),
  gale: Object.freeze({ typeCode: 1, tempo: 10, comeback: 3 }),
  sleet: Object.freeze({ typeCode: 2, tempo: 2, comeback: 6 }),
  eclipse: Object.freeze({ typeCode: 1, tempo: 7, comeback: 2 }),
  thunder_rain: Object.freeze({ typeCode: 2, tempo: 8, comeback: 4 }),
  blizzard: Object.freeze({ typeCode: 2, tempo: 1, comeback: 8 }),
  scorching_sun: Object.freeze({ typeCode: 1, tempo: 9, comeback: 3 }),
  acid_rain: Object.freeze({ typeCode: 3, tempo: 2, comeback: 8 }),
  high_temp: Object.freeze({ typeCode: 3, tempo: 5, comeback: 10 }),
  heavy_rain: Object.freeze({ typeCode: 2, tempo: 3, comeback: 4 }),
  mid_snow: Object.freeze({ typeCode: 2, tempo: 1, comeback: 8 }),
  big_snow: Object.freeze({ typeCode: 2, tempo: 3, comeback: 7 }),
  sandstorm: Object.freeze({ typeCode: 1, tempo: 7, comeback: 2 }),
  cloud_sea: Object.freeze({ typeCode: 2, tempo: 4, comeback: 3 }),
  rainbow: Object.freeze({ typeCode: 1, tempo: 7, comeback: 5 }),
  drought: Object.freeze({ typeCode: 1, tempo: 9, comeback: 2 }),
  sun_moon: Object.freeze({ typeCode: 3, tempo: 6, comeback: 15 }),
  sunbeam: Object.freeze({ typeCode: 1, tempo: 8, comeback: 11 }),
  spacetime_storm: Object.freeze({ typeCode: 3, tempo: 3, comeback: 14 }),
  sunny_rain: Object.freeze({ typeCode: 1, tempo: 3, comeback: 2 }),
  clear: Object.freeze({ typeCode: 1, tempo: 8, comeback: 2 }),
  clear_thunder: Object.freeze({ typeCode: 3, tempo: 4, comeback: 8 }),
  toxic_fog: Object.freeze({ typeCode: 3, tempo: 2, comeback: 10 }),
});

const CHARACTER_WEATHER_AFFINITY = Object.freeze({
  baie: Object.freeze({
    light_snow: 4,
    frost: 4,
    blizzard: 3,
    big_snow: 3,
    sleet: 2,
  }),
  daheita: Object.freeze({
    gale: 4,
    drought: 4,
    scorching_sun: 3,
    clear: 3,
    sunbeam: 3,
  }),
  fengjin: Object.freeze({
    gale: 3,
    rainbow: 4,
    sandstorm: 2,
    eclipse: 3,
  }),
  huangquan: Object.freeze({
    acid_rain: 6,
    toxic_fog: 7,
    clear_thunder: 3,
    rainbow: 2,
  }),
  huohua: Object.freeze({
    scorching_sun: 5,
    clear: 4,
    sunbeam: 4,
    gale: 3,
  }),
  sanyueqi: Object.freeze({
    illusion_sun: 4,
    fish_rain: 4,
    rainbow: 3,
    thunder_rain: 2,
  }),
  xilian: Object.freeze({
    light_snow: 3,
    blizzard: 3,
    spacetime_storm: 5,
    sun_moon: 2,
  }),
  xiadie: Object.freeze({
    frost: 3,
    light_snow: 2,
    toxic_fog: 3,
    acid_rain: 2,
  }),
  yaoguang: Object.freeze({
    illusion_sun: 4,
    fish_rain: 3,
    gale: 2,
    clear: 2,
  }),
  zhigengniao: Object.freeze({
    high_temp: 2,
    sunbeam: 2,
    acid_rain: 1,
  }),
});

function createProjectionUi() {
  return {
    indexToPlayerId: ['P1', 'P2'],
    playerIdToIndex: { P1: 0, P2: 1 },
    logs: [],
    effectEvents: [],
    attackPreviewMask: 0,
    defensePreviewMask: 0,
  };
}

function projectPureGame(state) {
  return projectStateToLegacyRoom(state, createProjectionUi());
}

function buildPlayerMeta(state, playerIndex) {
  const character = state.catalog.characters[state.characterIndex[playerIndex]];
  const aurora = state.catalog.auroras[state.auroraIndex[playerIndex]];
  return {
    id: `P${playerIndex + 1}`,
    characterId: character ? character.id : '',
    auroraDiceId: aurora ? aurora.id : '',
  };
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getCurrentWeatherId(state) {
  if (!state || state.weatherIndex == null || state.weatherIndex < 0) return null;
  return state.catalog && state.catalog.weatherIds
    ? state.catalog.weatherIds[state.weatherIndex] || null
    : null;
}

function getWeatherProfile(weatherId) {
  return WEATHER_PROFILE[weatherId] || { typeCode: 0, tempo: 0, comeback: 0 };
}

function getWeatherTypeCode(weatherId) {
  return getWeatherProfile(weatherId).typeCode || 0;
}

function getCharacterWeatherAffinity(characterId, weatherId) {
  const affinity = CHARACTER_WEATHER_AFFINITY[characterId];
  if (!affinity) return 0;
  return safeNumber(affinity[weatherId], 0);
}

function getNextWeatherGate(round) {
  for (let i = 0; i < WEATHER_STAGE_ROUNDS.length; i += 1) {
    if (round < WEATHER_STAGE_ROUNDS[i]) return WEATHER_STAGE_ROUNDS[i];
  }
  return 0;
}

function getMaskIndices(state, mask) {
  return (state && state.catalog && state.catalog.indicesByMask && state.catalog.indicesByMask[mask]) || [];
}

function sumSelectedDice(dice, indices) {
  let total = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const die = dice[indices[i]];
    if (die) total += die.value || 0;
  }
  return total;
}

function analyzeDiceSelection(dice, indices) {
  const values = [];
  let allOdd = indices.length > 0;
  let allSame = indices.length > 0;
  let allSix = indices.length > 0;
  let includesSeven = false;
  let sum = 0;
  const freq = new Map();

  for (let i = 0; i < indices.length; i += 1) {
    const die = dice[indices[i]];
    if (!die) continue;
    const value = die.value || 0;
    values.push(value);
    sum += value;
    includesSeven = includesSeven || value === 7;
    allOdd = allOdd && (value % 2 === 1);
    allSix = allSix && value === 6;
    if (i > 0) allSame = allSame && value === values[0];
    freq.set(value, (freq.get(value) || 0) + 1);
  }

  let hasDuplicate = false;
  let hasTriplet = false;
  for (const count of freq.values()) {
    if (count >= 2) hasDuplicate = true;
    if (count >= 3) hasTriplet = true;
  }

  return {
    count: indices.length,
    sum,
    allOdd,
    allSame,
    allSix,
    includesSeven,
    hasDuplicate,
    hasTriplet,
  };
}

function getNetPendingDamage(state, aiIndex) {
  const attackValue = Number.isFinite(state.attackValue) && state.attackValue >= 0 ? state.attackValue : 0;
  const defenseValue = Number.isFinite(state.defenseValue) && state.defenseValue >= 0 ? state.defenseValue : 0;
  const netPendingDamage = Math.max(0, attackValue - defenseValue);
  return {
    attackValue,
    defenseValue,
    netPendingDamage,
    aiPendingDamage: state.attacker === aiIndex ? netPendingDamage : 0,
    incomingPendingDamage: state.attacker === (aiIndex === 0 ? 1 : 0) ? netPendingDamage : 0,
  };
}

function buildStatusValue(state, aiIndex, opponentIndex) {
  let score = 0;
  score += ((state.poison[opponentIndex] || 0) - (state.poison[aiIndex] || 0)) * 5;
  score += ((state.resilience[aiIndex] || 0) - (state.resilience[opponentIndex] || 0)) * 3;
  score += ((state.thorns[aiIndex] || 0) - (state.thorns[opponentIndex] || 0)) * 2;
  score += ((state.power[aiIndex] || 0) - (state.power[opponentIndex] || 0)) * 3;
  score += ((state.forceField[aiIndex] || 0) - (state.forceField[opponentIndex] || 0)) * 8;
  score += ((state.hackActive[aiIndex] || 0) - (state.hackActive[opponentIndex] || 0)) * 6;
  score += ((state.counterActive[aiIndex] || 0) - (state.counterActive[opponentIndex] || 0)) * 6;
  score += ((state.unyielding[aiIndex] || 0) - (state.unyielding[opponentIndex] || 0)) * 12;
  score += ((state.xilianAscensionActive[aiIndex] || 0) - (state.xilianAscensionActive[opponentIndex] || 0)) * 10;
  return score;
}

function buildCharacterSynergy(state, aiIndex, game, aiPlayer) {
  let score = 0;
  if (state.phase === 1 && Array.isArray(game.attackDice) && game.attackDice.length > 0) {
    const indices = [];
    for (let i = 0; i < game.attackDice.length; i += 1) indices.push(i);
    score += characterAiScoreAttack(aiPlayer.characterId, game.attackDice, indices, game, aiPlayer.id) * 0.2;
  }
  if (state.phase === 3 && Array.isArray(game.defenseDice) && game.defenseDice.length > 0) {
    const indices = [];
    for (let i = 0; i < game.defenseDice.length; i += 1) indices.push(i);
    score += characterAiScoreDefense(aiPlayer.characterId, game.defenseDice, indices, game, aiPlayer.id) * 0.2;
  }
  return score;
}

function getWeatherContext(state, aiIndex, options = {}) {
  const opponentIndex = aiIndex === 0 ? 1 : 0;
  const game = options.game || projectPureGame(state);
  const aiPlayer = options.aiPlayer || buildPlayerMeta(state, aiIndex);
  const weatherId = getCurrentWeatherId(state);
  const profile = getWeatherProfile(weatherId);
  const hpLead = (state.hp[aiIndex] || 0) - (state.hp[opponentIndex] || 0);
  const aiHp = state.hp[aiIndex] || 0;
  const opponentHp = state.hp[opponentIndex] || 0;
  const nextGate = getNextWeatherGate(state.round || 0);
  const roundsToNextWeatherGate = nextGate > 0 ? Math.max(0, nextGate - (state.round || 0)) : 0;
  const currentCandidates = safeNumber(state.weatherCandidateCount, 0);
  const currentWeatherNumeric = weatherId && state.weatherIndex >= 0 ? state.weatherIndex + 1 : 0;
  const pending = getNetPendingDamage(state, aiIndex);
  const projectedAfterCurrentHit = aiHp - pending.incomingPendingDamage;

  let weatherTempoValue = profile.tempo;
  let weatherComebackValue = profile.comeback;
  let weatherComboValue = getCharacterWeatherAffinity(aiPlayer.characterId, weatherId);
  let sellHpWindowValue = 0;

  if (weatherId === 'gale' && state.attacker === aiIndex && state.phase === 1) weatherTempoValue += 8;
  if (weatherId === 'thunder_rain') {
    if (state.attacker === aiIndex && state.phase === 1) weatherTempoValue += 7;
    if (state.defender === aiIndex && state.phase === 3) weatherTempoValue += 7;
  }
  if (weatherId === 'drought' && state.attacker === aiIndex) {
    weatherTempoValue += safeNumber(state.defenseLevel[opponentIndex], 0) * 2;
  }
  if (weatherId === 'rainbow' && state.attacker === aiIndex) weatherTempoValue += 5;
  if (weatherId === 'cloud_sea') weatherComboValue += ((state.auroraUsesRemaining[aiIndex] || 0) <= 1 ? 4 : 0);
  if (weatherId === 'clear') weatherComboValue += safeNumber(state.power[aiIndex], 0) * 0.5;
  if (weatherId === 'acid_rain') weatherComboValue += safeNumber(state.poison[opponentIndex], 0) * 2;
  if (weatherId === 'toxic_fog') weatherComboValue += safeNumber(state.poison[opponentIndex], 0) * 1.5;
  if (weatherId === 'illusion_sun') weatherComboValue += safeNumber(state.thorns[aiIndex], 0) * 1.2;
  if (weatherId === 'light_snow') weatherComboValue += safeNumber(state.resilience[aiIndex], 0) * 1.2;
  if (weatherId === 'spacetime_storm') weatherComboValue += hpLead <= -8 ? 8 : -4;

  if (weatherId === 'sun_moon') {
    if (aiHp <= 3) weatherComebackValue += 18;
    if (projectedAfterCurrentHit > 0 && projectedAfterCurrentHit <= 3) sellHpWindowValue += 16;
  }
  if (weatherId === 'sunbeam') {
    if (aiHp < opponentHp) weatherComebackValue += 14;
    if (projectedAfterCurrentHit > 0 && projectedAfterCurrentHit < opponentHp) sellHpWindowValue += 14;
  }
  if (weatherId === 'high_temp') {
    if (aiHp < opponentHp) weatherComebackValue += 12;
    if (projectedAfterCurrentHit > 0 && projectedAfterCurrentHit < opponentHp) sellHpWindowValue += 10;
  }
  if (weatherId === 'acid_rain') {
    if (aiHp > opponentHp) weatherComebackValue -= 10;
    else weatherComebackValue += 6;
    if (projectedAfterCurrentHit > 0 && projectedAfterCurrentHit <= opponentHp) sellHpWindowValue += 6;
  }
  if (weatherId === 'light_snow' && state.phase === 1 && state.attacker === aiIndex) {
    sellHpWindowValue += safeNumber(state.rerollsLeft, 0) > 0 ? 8 : 0;
  }
  if (weatherId === 'spacetime_storm') {
    if (hpLead <= -8) weatherComebackValue += 18;
    if (hpLead >= 8) weatherComebackValue -= 8;
  }

  let nextStageWeatherExpectation = 0;
  if (nextGate > 0 && roundsToNextWeatherGate <= 2 && state.catalog && state.catalog.weatherPoolsByStage) {
    const pool = state.catalog.weatherPoolsByStage[nextGate] || [];
    if (pool.length > 0) {
      let total = 0;
      for (let i = 0; i < pool.length; i += 1) {
        const weatherIndex = pool[i];
        const nextWeatherId = state.catalog.weatherIds[weatherIndex];
        const nextProfile = getWeatherProfile(nextWeatherId);
        let potential = (nextProfile.tempo * 0.7) + nextProfile.comeback;
        potential += getCharacterWeatherAffinity(aiPlayer.characterId, nextWeatherId);
        if (nextWeatherId === 'sun_moon' && aiHp <= 8) potential += 4;
        if (nextWeatherId === 'sunbeam' && aiHp <= opponentHp) potential += 4;
        if (nextWeatherId === 'acid_rain' && aiPlayer.characterId === 'huangquan') potential += 5;
        if (nextWeatherId === 'cloud_sea' && aiPlayer.auroraDiceId) potential += 3;
        total += potential;
      }
      nextStageWeatherExpectation = total / pool.length;
    }
  }

  return {
    weatherId,
    currentWeatherId: currentWeatherNumeric,
    currentWeatherType: getWeatherTypeCode(weatherId),
    weatherStageRound: safeNumber(state.weatherStageRound, 0),
    roundsToNextWeatherGate,
    weatherCandidateCount: currentCandidates,
    weatherTempoValue,
    weatherComebackValue,
    weatherComboValue,
    sellHpWindowValue,
    nextStageWeatherExpectation,
    projectedAfterCurrentHit,
    game,
    aiPlayer,
    opponentIndex,
  };
}

function extractFeatures(state, aiIndex) {
  const opponentIndex = aiIndex === 0 ? 1 : 0;
  const aiPlayer = buildPlayerMeta(state, aiIndex);
  const game = projectPureGame(state);
  const hpLead = (state.hp[aiIndex] || 0) - (state.hp[opponentIndex] || 0);
  const aiHp = state.hp[aiIndex] || 0;
  const opponentHp = state.hp[opponentIndex] || 0;
  const pending = getNetPendingDamage(state, aiIndex);
  const lethalPressure = (opponentHp <= Math.max(1, pending.aiPendingDamage) ? 1 : 0)
    - (aiHp <= Math.max(1, pending.incomingPendingDamage) ? 1 : 0);
  const statusValue = buildStatusValue(state, aiIndex, opponentIndex);
  const characterSynergy = buildCharacterSynergy(state, aiIndex, game, aiPlayer);
  const weather = getWeatherContext(state, aiIndex, { game, aiPlayer });

  return {
    aiHp,
    opponentHp,
    hpLead,
    lethalPressure,
    expectedDamageNext: pending.aiPendingDamage - pending.incomingPendingDamage,
    initiativeValue: state.attacker === aiIndex ? 1 : -1,
    auroraEconomy: (state.auroraUsesRemaining[aiIndex] || 0) - (state.auroraUsesRemaining[opponentIndex] || 0),
    rerollEconomy: (state.rerollsLeft || 0) * (state.attacker === aiIndex ? 1 : -1),
    statusValue,
    characterSynergy,
    roundTempo: state.phase === 1 ? 1 : (state.phase === 3 ? -1 : 0),
    variancePressure: hpLead >= 8 ? -1 : (hpLead <= -8 ? 1 : 0),
    selfPoison: state.poison[aiIndex] || 0,
    oppPoison: state.poison[opponentIndex] || 0,
    selfResilience: state.resilience[aiIndex] || 0,
    oppResilience: state.resilience[opponentIndex] || 0,
    selfPower: state.power[aiIndex] || 0,
    oppPower: state.power[opponentIndex] || 0,
    selfThorns: state.thorns[aiIndex] || 0,
    oppThorns: state.thorns[opponentIndex] || 0,
    selfForceField: state.forceField[aiIndex] || 0,
    oppForceField: state.forceField[opponentIndex] || 0,
    selfCounter: state.counterActive[aiIndex] || 0,
    oppCounter: state.counterActive[opponentIndex] || 0,
    selfHack: state.hackActive[aiIndex] || 0,
    oppHack: state.hackActive[opponentIndex] || 0,
    selfUnyielding: state.unyielding[aiIndex] || 0,
    oppUnyielding: state.unyielding[opponentIndex] || 0,
    selfAscension: state.xilianAscensionActive[aiIndex] || 0,
    oppAscension: state.xilianAscensionActive[opponentIndex] || 0,
    isAttackSelect: state.phase === 1 ? 1 : 0,
    isDefenseSelect: state.phase === 3 ? 1 : 0,
    currentWeatherId: weather.currentWeatherId,
    currentWeatherType: weather.currentWeatherType,
    weatherStageRound: weather.weatherStageRound,
    roundsToNextWeatherGate: weather.roundsToNextWeatherGate,
    weatherCandidateCount: weather.weatherCandidateCount,
    weatherTempoValue: weather.weatherTempoValue,
    weatherComebackValue: weather.weatherComebackValue,
    weatherComboValue: weather.weatherComboValue,
    sellHpWindowValue: weather.sellHpWindowValue,
    nextStageWeatherExpectation: weather.nextStageWeatherExpectation,
  };
}

function extractFeatureVector(state, aiIndex, options = {}) {
  const features = options.features || extractFeatures(state, aiIndex);
  const order = Array.isArray(options.featureOrder) && options.featureOrder.length > 0
    ? options.featureOrder
    : FEATURE_ORDER;
  return order.map((key) => {
    const value = features[key];
    return Number.isFinite(value) ? value : 0;
  });
}

function evaluateHeuristicState(state, aiIndex, options = {}) {
  const features = options.features || extractFeatures(state, aiIndex);
  const opponentHpPenalty = (30 - features.opponentHp) * 4;
  const selfHpPenalty = (30 - features.aiHp) * 3;
  return (features.hpLead * 18)
    + (features.lethalPressure * 180)
    + (features.expectedDamageNext * 28)
    + (features.initiativeValue * 14)
    + (features.auroraEconomy * 16)
    + (features.rerollEconomy * 10)
    + (features.statusValue * 1.2)
    + (features.characterSynergy * 5)
    + (features.roundTempo * 6)
    + (features.variancePressure * 8)
    + opponentHpPenalty
    - selfHpPenalty;
}

function shouldUseValueModel(options = {}) {
  if (typeof options.useValueModel === 'boolean') return options.useValueModel;
  const difficulty = getDifficultyConfig(options.difficultyId);
  return !!(difficulty && difficulty.useValueModel);
}

function shouldUseWeatherLookahead(options = {}) {
  if (typeof options.weatherLookahead === 'boolean') return options.weatherLookahead;
  const difficulty = getDifficultyConfig(options.difficultyId);
  return !!(difficulty && difficulty.weatherLookahead);
}

function resolveModelScale(options = {}) {
  if (Number.isFinite(options.modelScale)) return options.modelScale;
  const difficulty = getDifficultyConfig(options.difficultyId);
  if (difficulty && Number.isFinite(difficulty.modelScale)) return difficulty.modelScale;
  return DEFAULT_MODEL_SCALE;
}

function evaluateWeatherState(state, aiIndex, options = {}) {
  if (!shouldUseWeatherLookahead(options)) return 0;
  const features = options.features || extractFeatures(state, aiIndex);
  return (features.weatherTempoValue * 8)
    + (features.weatherComebackValue * 9)
    + (features.weatherComboValue * 7)
    + (features.sellHpWindowValue * 11)
    + (features.nextStageWeatherExpectation * 7)
    + (features.roundsToNextWeatherGate <= 1 ? 10 : 0);
}

function evaluateState(state, aiIndex, options = {}) {
  const features = options.features || extractFeatures(state, aiIndex);
  const heuristicScore = evaluateHeuristicState(state, aiIndex, { features });
  const weatherScore = evaluateWeatherState(state, aiIndex, {
    difficultyId: options.difficultyId,
    weatherLookahead: options.weatherLookahead,
    features,
  });
  const baseScore = heuristicScore + weatherScore;
  if (!shouldUseValueModel(options)) return baseScore;

  const model = options.model || loadValueModel({
    path: options.modelPath,
    expectedVersion: VALUE_MODEL_VERSION,
  });
  if (!model || model.version !== VALUE_MODEL_VERSION) return baseScore;

  const featureVector = options.featureVector || extractFeatureVector(state, aiIndex, {
    features,
    featureOrder: model.featureOrder,
  });
  const prediction = predictStateValue(featureVector, model);
  if (!Number.isFinite(prediction)) return baseScore;
  return baseScore + (resolveModelScale(options) * prediction);
}

function projectedDefenseFromMask(state, actionMask, game, aiPlayer) {
  const indices = getMaskIndices(state, actionMask);
  const base = sumSelectedDice(game.defenseDice, indices);
  const hook = characterAiScoreDefense(aiPlayer.characterId, game.defenseDice, indices, game, aiPlayer.id);
  return {
    indices,
    base,
    hook,
    total: base + hook,
    shape: analyzeDiceSelection(game.defenseDice, indices),
  };
}

function projectedAttackFromMask(state, actionMask, game, aiPlayer) {
  const indices = getMaskIndices(state, actionMask);
  const base = sumSelectedDice(game.attackDice, indices);
  const hook = characterAiScoreAttack(aiPlayer.characterId, game.attackDice, indices, game, aiPlayer.id);
  return {
    indices,
    base,
    hook,
    total: base + hook,
    shape: analyzeDiceSelection(game.attackDice, indices),
  };
}

function getWeatherActionBias(state, action, aiIndex, options = {}) {
  if (!action) return { score: 0, preserve: false, tag: '' };
  const difficulty = getDifficultyConfig(options.difficultyId);
  if (!options.enableWeatherBias && !(difficulty && difficulty.weatherLookahead)) {
    return { score: 0, preserve: false, tag: '' };
  }

  const game = options.game || projectPureGame(state);
  const aiPlayer = options.aiPlayer || buildPlayerMeta(state, aiIndex);
  const weather = getWeatherContext(state, aiIndex, { game, aiPlayer });
  const opponentIndex = aiIndex === 0 ? 1 : 0;
  const opcode = Number.isInteger(action.opcode) ? action.opcode : getActionOpcode(action);
  const mask = Number.isInteger(action.mask) ? action.mask : getActionMask(action);
  const hpLead = (state.hp[aiIndex] || 0) - (state.hp[opponentIndex] || 0);
  const weatherId = weather.weatherId;
  let score = 0;
  let preserve = false;
  let tag = '';

  if (!weatherId) return { score, preserve, tag };

  if (opcode === OPCODES.REROLL_ATTACK) {
    if (weatherId === 'illusion_sun' && hpLead <= 6) {
      score += 24;
      preserve = true;
      tag = 'illusion_sun_reroll';
    }
    if (weatherId === 'fish_rain') score += 8;
    if (weatherId === 'light_snow') score -= (state.hp[aiIndex] || 0) <= 16 ? 24 : 14;
    return { score, preserve, tag };
  }

  if (opcode === OPCODES.CONFIRM_ATTACK) {
    const projection = projectedAttackFromMask(state, mask, game, aiPlayer);
    if (weatherId === 'rainbow' && projection.shape.sum <= 10) {
      score += 28;
      preserve = true;
      tag = 'rainbow_low_attack';
    }
    if (weatherId === 'sandstorm' && projection.shape.allOdd) {
      score += 24;
      preserve = true;
      tag = 'sandstorm_odd_line';
    }
    if (weatherId === 'frost' && projection.shape.hasDuplicate) {
      score += 18;
      preserve = true;
      tag = 'frost_duplicate_line';
    }
    if (weatherId === 'spacetime_storm' && projection.shape.allSix) {
      score += hpLead <= -6 ? 40 : (hpLead >= 6 ? -20 : 10);
      preserve = true;
      tag = 'spacetime_storm_six_line';
    }
    if (weatherId === 'drought') {
      score += Math.min(30, safeNumber(state.defenseLevel[opponentIndex], 0) * 6);
      preserve = true;
      tag = tag || 'drought_breakpoint';
    }
    if (weatherId === 'gale') score += 10;
    if (weatherId === 'eclipse' && !projection.shape.allSame) score += 12;
    if (weatherId === 'thunder_rain') score += 12;
    if (weatherId === 'mid_snow' && projection.shape.hasTriplet) score += 18;
    if (weatherId === 'big_snow' && projection.shape.includesSeven) score += 16;
    if (weatherId === 'sun_moon' && (state.hp[aiIndex] || 0) <= 3) score += 22;
    if (weatherId === 'sunbeam' && (state.hp[aiIndex] || 0) < (state.hp[opponentIndex] || 0)) score += 16;
    return { score, preserve, tag };
  }

  if (opcode === OPCODES.CONFIRM_DEFENSE || opcode === OPCODES.USE_AURORA_DEFENSE) {
    const projected = opcode === OPCODES.CONFIRM_DEFENSE
      ? projectedDefenseFromMask(state, mask, game, aiPlayer)
      : {
        total: safeNumber(state.attackValue, 0),
        shape: { sum: 0, hasTriplet: false, includesSeven: false },
      };
    const projectedHp = (state.hp[aiIndex] || 0) - Math.max(0, safeNumber(state.attackValue, 0) - projected.total);

    if (weatherId === 'sun_moon' && projectedHp > 0 && projectedHp <= 3) {
      score += 40;
      preserve = true;
      tag = 'sun_moon_sell_hp';
    }
    if (weatherId === 'sunbeam' && projectedHp > 0 && projectedHp < (state.hp[opponentIndex] || 0)) {
      score += 30;
      preserve = true;
      tag = tag || 'sunbeam_sell_hp';
    }
    if (weatherId === 'high_temp' && projectedHp > 0 && projectedHp < (state.hp[opponentIndex] || 0)) {
      score += 22;
      preserve = true;
      tag = tag || 'high_temp_sell_hp';
    }
    if (weatherId === 'acid_rain' && projectedHp > 0 && projectedHp <= (state.hp[opponentIndex] || 0)) {
      score += 14 + getCharacterWeatherAffinity(aiPlayer.characterId, weatherId);
      preserve = preserve || getCharacterWeatherAffinity(aiPlayer.characterId, weatherId) > 0;
      tag = tag || 'acid_rain_balance_hp';
    }
    if (weatherId === 'thunder_rain') score += 10;
    if (weatherId === 'blizzard' && projected.total < 8) score += 18;
    if (opcode === OPCODES.CONFIRM_DEFENSE && weatherId === 'mid_snow' && projected.shape.hasTriplet) score += 18;
    if (opcode === OPCODES.CONFIRM_DEFENSE && weatherId === 'big_snow' && projected.shape.includesSeven) score += 14;
    return { score, preserve, tag };
  }

  return { score, preserve, tag };
}

function scoreAttackMaskLocal(state, actionMask, aiIndex, game, aiPlayer, options = {}) {
  const projection = projectedAttackFromMask(state, actionMask, game, aiPlayer);
  const auroraBonus = projection.indices.some((idx) => game.attackDice[idx] && game.attackDice[idx].isAurora && game.attackDice[idx].hasA) ? 6 : 0;
  const action = {
    opcode: OPCODES.CONFIRM_ATTACK,
    mask: actionMask,
  };
  return projection.base
    + projection.hook
    + auroraBonus
    + getWeatherActionBias(state, action, aiIndex, {
      difficultyId: options.difficultyId,
      game,
      aiPlayer,
      enableWeatherBias: options.enableWeatherBias,
    }).score;
}

function scoreDefenseMaskLocal(state, actionMask, aiIndex, game, aiPlayer, options = {}) {
  const projection = projectedDefenseFromMask(state, actionMask, game, aiPlayer);
  const incoming = Number.isFinite(state.attackValue) && state.attackValue >= 0 ? state.attackValue : 0;
  const coverage = Math.min(projection.total, incoming) * 0.8;
  const action = {
    opcode: OPCODES.CONFIRM_DEFENSE,
    mask: actionMask,
  };
  return projection.base
    + projection.hook
    + coverage
    + getWeatherActionBias(state, action, aiIndex, {
      difficultyId: options.difficultyId,
      game,
      aiPlayer,
      enableWeatherBias: options.enableWeatherBias,
    }).score;
}

function scoreRerollMaskLocal(state, actionMask, aiIndex, game, options = {}) {
  const indices = getMaskIndices(state, actionMask);
  let gain = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const die = game.attackDice[indices[i]];
    if (!die || die.isAurora) continue;
    gain += ((die.maxValue + 1) / 2) - die.value;
  }
  const hpLead = (state.hp[aiIndex] || 0) - (state.hp[aiIndex === 0 ? 1 : 0] || 0);
  const varianceBias = hpLead <= -8 ? 5 : (hpLead >= 8 ? -3 : 0);
  const weatherBias = getWeatherActionBias(state, {
    opcode: OPCODES.REROLL_ATTACK,
    mask: actionMask,
  }, aiIndex, {
    difficultyId: options.difficultyId,
    game,
    enableWeatherBias: options.enableWeatherBias,
  }).score;
  return (gain * 8) + varianceBias + weatherBias;
}

function scoreActionLocal(state, action, aiIndex, options = {}) {
  if (!action) return -Infinity;
  const opcode = getActionOpcode(action);
  const mask = getActionMask(action);
  const game = options.game || projectPureGame(state);
  const aiPlayer = options.aiPlayer || buildPlayerMeta(state, aiIndex);
  const features = options.features || extractFeatures(state, aiIndex);

  if (opcode === OPCODES.ROLL_ATTACK || opcode === OPCODES.ROLL_DEFENSE) {
    return evaluateHeuristicState(state, aiIndex, { features });
  }
  if (opcode === OPCODES.USE_AURORA_ATTACK || opcode === OPCODES.USE_AURORA_DEFENSE) {
    const bonus = features.auroraEconomy >= 0 ? 10 : 18;
    return evaluateHeuristicState(state, aiIndex, { features })
      + bonus
      + (features.lethalPressure > 0 ? 40 : 0)
      + getWeatherActionBias(state, action, aiIndex, {
        difficultyId: options.difficultyId,
        game,
        aiPlayer,
        enableWeatherBias: options.enableWeatherBias,
      }).score;
  }
  if (opcode === OPCODES.REROLL_ATTACK) {
    return evaluateHeuristicState(state, aiIndex, { features })
      + scoreRerollMaskLocal(state, mask, aiIndex, game, options);
  }
  if (opcode === OPCODES.CONFIRM_ATTACK) {
    return evaluateHeuristicState(state, aiIndex, { features })
      + scoreAttackMaskLocal(state, mask, aiIndex, game, aiPlayer, options);
  }
  if (opcode === OPCODES.CONFIRM_DEFENSE) {
    return evaluateHeuristicState(state, aiIndex, { features })
      + scoreDefenseMaskLocal(state, mask, aiIndex, game, aiPlayer, options);
  }
  const next = cloneState(state);
  applyActionInPlace(next, action);
  return evaluateHeuristicState(next, aiIndex);
}

module.exports = {
  FEATURE_ORDER,
  WEATHER_STAGE_ROUNDS,
  extractFeatures,
  extractFeatureVector,
  evaluateHeuristicState,
  evaluateWeatherState,
  evaluateState,
  scoreActionLocal,
  projectPureGame,
  buildPlayerMeta,
  getCurrentWeatherId,
  getWeatherContext,
  getWeatherActionBias,
  analyzeDiceSelection,
};
