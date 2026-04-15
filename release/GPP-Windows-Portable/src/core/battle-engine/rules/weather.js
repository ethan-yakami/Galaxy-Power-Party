const { nextInt } = require('../rng');
const { SOURCE_AURORA, WEATHER_NONE } = require('../constants');
const {
  hasDuplicates,
  areAllSame,
  countOddValues,
  hasTriplet,
  includesValue,
  areAllValuesSix,
  getSelectedCount,
} = require('./helpers');

const STAGE_ROUNDS = [2, 4, 6, 8];

function currentWeatherId(state) {
  if (state.weatherIndex == null || state.weatherIndex < 0) return null;
  return state.catalog.weatherIds[state.weatherIndex] || null;
}

function currentWeatherDef(state) {
  if (state.weatherIndex == null || state.weatherIndex < 0) return null;
  return state.catalog.weatherDefs[state.weatherIndex] || null;
}

function logWeather(runtime, text) {
  if (!runtime.logEnabled) return;
  runtime.log(`【天气】${text}`);
}

function getStageRoundByRound(round) {
  if (round >= 8) return 8;
  if (round >= 6) return 6;
  if (round >= 4) return 4;
  if (round >= 2) return 2;
  return 0;
}

function clearStageBonuses(state) {
  for (let i = 0; i < 2; i += 1) {
    if (state.weatherStageAttackBonus[i] > 0) {
      state.attackLevel[i] -= state.weatherStageAttackBonus[i];
      if (state.attackLevel[i] < 1) state.attackLevel[i] = 1;
      state.weatherStageAttackBonus[i] = 0;
    }
    if (state.weatherStageDefenseBonus[i] > 0) {
      state.defenseLevel[i] -= state.weatherStageDefenseBonus[i];
      if (state.defenseLevel[i] < 1) state.defenseLevel[i] = 1;
      state.weatherStageDefenseBonus[i] = 0;
    }
    if (state.weatherStagePowerGranted[i] > 0) {
      state.power[i] -= state.weatherStagePowerGranted[i];
      if (state.power[i] < 0) state.power[i] = 0;
      state.weatherStagePowerGranted[i] = 0;
    }
  }
}

function clearRoundBonuses(state) {
  for (let i = 0; i < 2; i += 1) {
    if (state.weatherActiveDefenseBonus[i] > 0) {
      state.defenseLevel[i] -= state.weatherActiveDefenseBonus[i];
      if (state.defenseLevel[i] < 1) state.defenseLevel[i] = 1;
      state.weatherActiveDefenseBonus[i] = 0;
    }
    if (state.weatherActiveResilienceBonus[i] > 0) {
      state.resilience[i] -= state.weatherActiveResilienceBonus[i];
      if (state.resilience[i] < 0) state.resilience[i] = 0;
      state.weatherActiveResilienceBonus[i] = 0;
    }
  }
}

function promotePendingRoundBonuses(state, runtime) {
  for (let i = 0; i < 2; i += 1) {
    if (state.weatherPendingDefenseBonus[i] > 0) {
      const amount = state.weatherPendingDefenseBonus[i];
      state.weatherPendingDefenseBonus[i] = 0;
      state.weatherActiveDefenseBonus[i] += amount;
      state.defenseLevel[i] += amount;
      logWeather(runtime, `${runtime.getPlayerName(i)}获得本回合防御等级+${amount}。`);
    }
    if (state.weatherPendingResilienceBonus[i] > 0) {
      const amount = state.weatherPendingResilienceBonus[i];
      state.weatherPendingResilienceBonus[i] = 0;
      state.weatherActiveResilienceBonus[i] += amount;
      state.resilience[i] += amount;
      logWeather(runtime, `${runtime.getPlayerName(i)}获得本回合临时韧性${amount}层。`);
    }
  }
}

function addStageLevelBonus(state, playerIndex, attackBonus, defenseBonus) {
  if (attackBonus) {
    state.attackLevel[playerIndex] += attackBonus;
    state.weatherStageAttackBonus[playerIndex] += attackBonus;
  }
  if (defenseBonus) {
    state.defenseLevel[playerIndex] += defenseBonus;
    state.weatherStageDefenseBonus[playerIndex] += defenseBonus;
  }
}

function addStagePower(state, playerIndex, amount) {
  if (!amount) return;
  state.power[playerIndex] += amount;
  state.weatherStagePowerGranted[playerIndex] += amount;
}

function chooseStageWeather(state, stageRound) {
  if (state.weatherPresetIndex != null && state.weatherPresetIndex >= 0) {
    return state.weatherPresetIndex;
  }
  const pool = state.catalog.weatherPoolsByStage[stageRound] || [];
  if (!pool.length) return WEATHER_NONE;
  return pool[nextInt(state, pool.length)];
}

function applyStageEnter(state, runtime, weatherId) {
  const def = currentWeatherDef(state);
  if (!def) return;

  if (weatherId === 'heavy_rain') {
    addStageLevelBonus(state, 0, 1, 1);
    addStageLevelBonus(state, 1, 1, 1);
    logWeather(runtime, `${def.name}生效：双方攻击等级+1，防御等级+1（阶段内有效）。`);
    return;
  }

  if (weatherId === 'cloud_sea') {
    state.auroraUsesRemaining[0] += 1;
    state.auroraUsesRemaining[1] += 1;
    logWeather(runtime, `${def.name}生效：双方各获得1次曜彩骰使用次数。`);
    return;
  }

  if (weatherId === 'clear') {
    addStagePower(state, 0, 5);
    addStagePower(state, 1, 5);
    logWeather(runtime, `${def.name}生效：双方各获得5层力量（阶段内有效）。`);
    return;
  }

  if (weatherId === 'toxic_fog') {
    state.poison[0] += 2;
    state.poison[1] += 2;
    logWeather(runtime, `${def.name}生效：双方各附加2层中毒。`);
  }
}

function applyRoundStart(state, runtime) {
  const weatherId = currentWeatherId(state);
  if (!weatherId) return;

  if (weatherId === 'acid_rain') {
    if (state.hp[0] !== state.hp[1]) {
      const target = state.hp[0] > state.hp[1] ? 0 : 1;
      state.poison[target] += 1;
      logWeather(runtime, `酸雨生效：${runtime.getPlayerName(target)}生命更高，附加1层中毒。`);
    }
    return;
  }

  if (weatherId === 'high_temp') {
    if (state.hp[0] !== state.hp[1]) {
      const target = state.hp[0] < state.hp[1] ? 0 : 1;
      addStagePower(state, target, 2);
      logWeather(runtime, `高温生效：${runtime.getPlayerName(target)}生命更低，获得2层力量（阶段内有效）。`);
    }
    return;
  }

  if (weatherId === 'sleet') {
    for (let i = 0; i < 2; i += 1) {
      if (state.hp[i] < state.maxHp[i]) {
        state.counterActive[i] = 1;
        state.weatherActiveDefenseBonus[i] += 2;
        state.defenseLevel[i] += 2;
        logWeather(runtime, `雨夹雪生效：${runtime.getPlayerName(i)}获得反击并在本回合防御等级+2。`);
      }
    }
  }
}

function updateWeatherForNewRound(state, runtime) {
  clearRoundBonuses(state);
  state.weatherChangedRound = 0;

  const stageRound = getStageRoundByRound(state.round);
  if (STAGE_ROUNDS.includes(state.round) && stageRound !== state.weatherStageRound) {
    clearStageBonuses(state);
    state.weatherStageRound = stageRound;
    state.weatherCandidateCount = 0;

    const pool = state.catalog.weatherPoolsByStage[stageRound] || [];
    for (let i = 0; i < state.weatherCandidates.length; i += 1) {
      state.weatherCandidates[i] = -1;
    }
    if (state.weatherPresetIndex != null && state.weatherPresetIndex >= 0) {
      state.weatherCandidates[0] = state.weatherPresetIndex;
      state.weatherCandidateCount = 1;
    } else {
      for (let i = 0; i < pool.length; i += 1) {
        state.weatherCandidates[i] = pool[i];
      }
      state.weatherCandidateCount = pool.length;
    }

    const nextWeather = chooseStageWeather(state, stageRound);
    state.weatherIndex = nextWeather;
    state.weatherEnteredRound = state.round;
    state.weatherChangedRound = state.round;

    const def = currentWeatherDef(state);
    if (def) {
      logWeather(runtime, `第${state.round}回合天气切换：${def.name}。`);
      applyStageEnter(state, runtime, def.id);
    } else {
      logWeather(runtime, `第${state.round}回合天气阶段无候选，回退为无天气。`);
    }
  }

  promotePendingRoundBonuses(state, runtime);
  applyRoundStart(state, runtime);
  state.weatherAttackRerolledInRound[0] = 0;
  state.weatherAttackRerolledInRound[1] = 0;
}

function onEndCurrentRound(state, endingAttacker, runtime) {
  if (currentWeatherId(state) !== 'light_snow') return;
  if (!state.weatherAttackRerolledInRound[endingAttacker]) {
    state.weatherPendingResilienceBonus[endingAttacker] += 3;
    logWeather(runtime, `细雪生效：${runtime.getPlayerName(endingAttacker)}攻击回合未重投，下回合获得3层临时韧性。`);
  }
}

function getAttackRerollBonus(state) {
  const weatherId = currentWeatherId(state);
  if (weatherId === 'fish_rain') return 1;
  if (weatherId === 'illusion_sun') return 2;
  return 0;
}

function getAuroraMinValue(catalog, auroraIndex) {
  const aurora = catalog.auroras[auroraIndex];
  if (!aurora) return 1;
  let min = aurora.facesValues[0];
  for (let i = 1; i < aurora.faceCount; i += 1) {
    if (aurora.facesValues[i] < min) min = aurora.facesValues[i];
  }
  return min;
}

function rerollDieLike(state, roll, index) {
  if (roll.sourceKinds[index] === SOURCE_AURORA) {
    const auroraIndex = roll.auroraIndices[index];
    const aurora = state.catalog.auroras[auroraIndex];
    const faceIndex = nextInt(state, aurora.faceCount);
    roll.values[index] = aurora.facesValues[faceIndex];
    roll.maxValues[index] = aurora.maxValue;
    roll.hasA[index] = aurora.facesHasA[faceIndex];
    return;
  }
  const maxValue = roll.maxValues[index];
  roll.values[index] = nextInt(state, maxValue) + 1;
  roll.hasA[index] = 0;
}

function canAvoidMin(state, roll, index) {
  if (roll.sourceKinds[index] === SOURCE_AURORA) {
    const aurora = state.catalog.auroras[roll.auroraIndices[index]];
    return aurora.distinctValueCount > 1;
  }
  return roll.maxValues[index] > 1;
}

function applyNoMinConstraint(state, roll, index) {
  if (!canAvoidMin(state, roll, index)) return;
  const minValue = roll.sourceKinds[index] === SOURCE_AURORA
    ? getAuroraMinValue(state.catalog, roll.auroraIndices[index])
    : 1;
  let guard = 0;
  while (roll.values[index] === minValue && guard < 24) {
    rerollDieLike(state, roll, index);
    guard += 1;
  }
}

function applyNoMaxConstraint(state, roll, index) {
  if (!canAvoidMin(state, roll, index)) return;
  let guard = 0;
  while (roll.values[index] === roll.maxValues[index] && guard < 24) {
    rerollDieLike(state, roll, index);
    guard += 1;
  }
}

function applySingleDieConstraint(state, roll, index, role) {
  const weatherId = currentWeatherId(state);
  if (!weatherId) return;
  if (weatherId === 'frog_rain') applyNoMinConstraint(state, roll, index);
  if (weatherId === 'sunny_rain' && role === 'defense') applyNoMaxConstraint(state, roll, index);
}

function applyRollConstraints(state, roll, role) {
  for (let i = 0; i < roll.count; i += 1) {
    applySingleDieConstraint(state, roll, i, role);
  }
}

function onAttackReroll(state, actor, runtime) {
  state.weatherAttackRerolledInRound[actor] = 1;
  if (currentWeatherId(state) === 'illusion_sun') {
    state.thorns[actor] += 2;
    logWeather(runtime, `幻日生效：${runtime.getPlayerName(actor)}执行重投，附加2层荆棘。`);
  }
}

function onAttackSelect(state, actor, opponent, roll, mask, runtime) {
  const weatherId = currentWeatherId(state);
  if (!weatherId) return;

  if (weatherId === 'frost') {
    if (hasDuplicates(roll, mask)) {
      state.weatherPendingDefenseBonus[actor] += 1;
      logWeather(runtime, `霜生效：${runtime.getPlayerName(actor)}本次有同点，下回合防御等级+1。`);
    }
    return;
  }

  if (weatherId === 'gale') {
    state.extraAttackQueued = 1;
    logWeather(runtime, '飓风生效：本次攻击获得连击。');
    return;
  }

  if (weatherId === 'eclipse') {
    if (!areAllSame(roll, mask)) {
      state.attackValue += 4;
      logWeather(runtime, `日蚀生效：攻击值+4（当前${state.attackValue}）。`);
    }
    return;
  }

  if (weatherId === 'thunder_rain') {
    state.attackValue += 4;
    logWeather(runtime, `雷雨生效：攻击方攻击值+4（当前${state.attackValue}）。`);
    return;
  }

  if (weatherId === 'mid_snow') {
    if (hasTriplet(roll, mask)) {
      const healed = runtime.heal(state, actor, 10);
      if (healed > 0) logWeather(runtime, `中雪生效，回复${healed}点生命。`);
    }
    return;
  }

  if (weatherId === 'big_snow') {
    if (includesValue(roll, mask, 7)) {
      state.attackValue += 4;
      logWeather(runtime, `大雪生效：攻击值+4（当前${state.attackValue}）。`);
    }
    return;
  }

  if (weatherId === 'sandstorm') {
    const oddCount = countOddValues(roll, mask);
    if (oddCount > 0 && oddCount === getSelectedCount(mask)) {
      state.power[actor] += 3;
      logWeather(runtime, `沙尘生效：${runtime.getPlayerName(actor)}获得3层力量（当前${state.power[actor]}层）。`);
    }
    return;
  }

  if (weatherId === 'rainbow') {
    if (state.attackValue <= 10) {
      state.attackPierce = 1;
      logWeather(runtime, '彩虹生效：本次攻击获得洞穿。');
    }
    return;
  }

  if (weatherId === 'drought') {
    const add = state.defenseLevel[opponent] * 3;
    if (add > 0) {
      state.attackValue += add;
      logWeather(runtime, `干旱生效：根据对方防御等级获得${add}攻击值（当前${state.attackValue}）。`);
    }
    return;
  }

  if (weatherId === 'sun_moon') {
    if (state.hp[actor] <= 3) {
      state.attackValue *= 2;
      logWeather(runtime, `日月同辉生效：生命值<=3，攻击值翻倍为${state.attackValue}。`);
    }
    return;
  }

  if (weatherId === 'sunbeam') {
    if (state.hp[actor] < state.hp[opponent]) {
      state.extraAttackQueued = 1;
      logWeather(runtime, '云隙光生效：生命值更低方攻击时获得连击。');
    }
    return;
  }

  if (weatherId === 'clear_thunder') {
    runtime.damage(state, actor, opponent, 3);
    logWeather(runtime, '晴雷生效：造成3点瞬伤。');
  }
}

function onDefenseSelect(state, defender, roll, mask, runtime) {
  const weatherId = currentWeatherId(state);
  if (!weatherId) return;

  if (weatherId === 'thunder_rain') {
    state.defenseValue += 4;
    logWeather(runtime, `雷雨生效：防守方防御值+4（当前${state.defenseValue}）。`);
    return;
  }

  if (weatherId === 'blizzard') {
    if (state.defenseValue < 8) {
      state.forceField[defender] = 1;
      logWeather(runtime, '暴雪生效：防御值<8，本回合获得力场。');
    }
    return;
  }

  if (weatherId === 'mid_snow') {
    if (hasTriplet(roll, mask)) {
      const healed = runtime.heal(state, defender, 10);
      if (healed > 0) logWeather(runtime, `中雪生效，回复${healed}点生命。`);
    }
    return;
  }

  if (weatherId === 'big_snow') {
    if (includesValue(roll, mask, 7)) {
      state.defenseValue += 4;
      logWeather(runtime, `大雪生效：防御值+4（当前${state.defenseValue}）。`);
    }
  }
}

function onAfterDamageResolved(state, attacker, defender, attackRoll, attackMask, totalDamage, runtime) {
  const weatherId = currentWeatherId(state);
  if (!weatherId) return;

  if (weatherId === 'scorching_sun') {
    if (totalDamage > 0) {
      const healed = runtime.heal(state, attacker, Math.floor(totalDamage * 0.5));
      if (healed > 0) logWeather(runtime, `烈日生效，回复${healed}点生命。`);
    }
    return;
  }

  if (weatherId === 'spacetime_storm') {
    if (areAllValuesSix(attackRoll, attackMask)) {
      const hp = state.hp[attacker];
      state.hp[attacker] = state.hp[defender];
      state.hp[defender] = hp;
      logWeather(runtime, `时空暴生效：${runtime.getPlayerName(attacker)}与${runtime.getPlayerName(defender)}交换生命值。`);
    }
  }
}

module.exports = {
  getStageRoundByRound,
  currentWeatherId,
  currentWeatherDef,
  updateWeatherForNewRound,
  onEndCurrentRound,
  getAttackRerollBonus,
  applySingleDieConstraint,
  applyRollConstraints,
  onAttackReroll,
  onAttackSelect,
  onDefenseSelect,
  onAfterDamageResolved,
};
