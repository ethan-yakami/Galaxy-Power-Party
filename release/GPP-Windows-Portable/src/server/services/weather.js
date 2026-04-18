const {
  hasDuplicates,
  areAllSame,
  countOddValues,
  areAllValuesSix,
  rollAuroraFace,
} = require('./dice');
const { AuroraRegistry } = require('./registry');
const {
  STAGE_ROUNDS,
  WEATHER_POOLS,
  WEATHER_DEFS,
} = require('../../content/entities/weather');

function pushWeatherEffectEvent(game, event) {
  const { pushEffectEvent } = require('./rooms');
  return pushEffectEvent(game, event);
}

function getWeatherCatalogSummary() {
  const weathers = Object.keys(WEATHER_DEFS)
    .sort()
    .map((id) => ({
      id,
      name: WEATHER_DEFS[id].name,
      type: WEATHER_DEFS[id].type,
    }));

  const poolsByStage = {};
  for (const [stageRound, ids] of Object.entries(WEATHER_POOLS)) {
    poolsByStage[stageRound] = ids.map((id) => ({
      id,
      name: WEATHER_DEFS[id] ? WEATHER_DEFS[id].name : id,
      type: WEATHER_DEFS[id] ? WEATHER_DEFS[id].type : null,
    }));
  }

  return {
    stageRounds: STAGE_ROUNDS.slice(),
    weathers,
    poolsByStage,
  };
}

function getStageRoundByRound(round) {
  if (round >= 8) return 8;
  if (round >= 6) return 6;
  if (round >= 4) return 4;
  if (round >= 2) return 2;
  return 0;
}

function toPlayerMap(room, initialValue) {
  const map = {};
  for (const p of room.players) {
    map[p.id] = initialValue;
  }
  return map;
}

function isInStageGate(round) {
  return STAGE_ROUNDS.includes(round);
}

function logWeather(game, text) {
  if (!game || !game.log) return;
  game.log.push(`[天气] ${text}`);
}

function getCurrentWeatherId(game) {
  return game && game.weather ? game.weather.weatherId : null;
}

function getCurrentWeather(game) {
  const id = getCurrentWeatherId(game);
  if (!id) return null;
  return WEATHER_DEFS[id] || null;
}

function getAuroraMinValue(auroraId) {
  const aurora = AuroraRegistry[auroraId];
  if (!aurora || !Array.isArray(aurora.faces) || !aurora.faces.length) return 1;
  let min = aurora.faces[0].value;
  for (const f of aurora.faces) {
    if (f.value < min) min = f.value;
  }
  return min;
}

function rerollNormalLike(die) {
  const value = Math.floor(Math.random() * die.sides) + 1;
  return Object.assign({}, die, {
    value,
    label: `${value}`,
  });
}

function rerollAuroraLike(die) {
  if (!die.auroraId) return die;
  return rollAuroraFace(die.auroraId);
}

function rerollDieLike(die) {
  if (die.isAurora) return rerollAuroraLike(die);
  return rerollNormalLike(die);
}

function canAvoidMin(die) {
  if (die.isAurora) {
    const aurora = AuroraRegistry[die.auroraId];
    if (!aurora || !Array.isArray(aurora.faces)) return false;
    const values = new Set(aurora.faces.map((f) => f.value));
    return values.size > 1;
  }
  return die.maxValue > 1;
}

function canAvoidMax(die) {
  if (die.isAurora) {
    const aurora = AuroraRegistry[die.auroraId];
    if (!aurora || !Array.isArray(aurora.faces)) return false;
    const values = new Set(aurora.faces.map((f) => f.value));
    return values.size > 1;
  }
  return die.maxValue > 1;
}

function applyNoMinConstraint(die) {
  let nextDie = die;
  if (!canAvoidMin(nextDie)) return nextDie;
  const minValue = nextDie.isAurora ? getAuroraMinValue(nextDie.auroraId) : 1;
  let guard = 0;
  while (nextDie.value === minValue && guard < 24) {
    nextDie = rerollDieLike(nextDie);
    guard += 1;
  }
  return nextDie;
}

function applyNoMaxConstraint(die) {
  let nextDie = die;
  if (!canAvoidMax(nextDie)) return nextDie;
  let guard = 0;
  while (nextDie.value === nextDie.maxValue && guard < 24) {
    nextDie = rerollDieLike(nextDie);
    guard += 1;
  }
  return nextDie;
}

function hasTriplet(selectedDice) {
  const freq = {};
  for (const d of selectedDice) {
    freq[d.value] = (freq[d.value] || 0) + 1;
  }
  return Object.values(freq).some((count) => count >= 3);
}

function includesValue(selectedDice, value) {
  return selectedDice.some((d) => d.value === value);
}

function healPlayer(game, playerId, amount, sourceName) {
  if (!amount || amount <= 0) return 0;
  const before = game.hp[playerId];
  const real = Math.min(amount, game.maxHp[playerId] - before);
  if (real <= 0) return 0;
  game.hp[playerId] = before + real;
  pushWeatherEffectEvent(game, {
    type: 'heal',
    playerId,
    amount: real,
    hpBefore: before,
    hpAfter: game.hp[playerId],
  });
  if (sourceName) {
    logWeather(game, '天气效果触发');
  }
  return real;
}

function instantDamage(game, sourceId, targetId, amount, sourceName) {
  if (!amount || amount <= 0) return 0;
  const before = game.hp[targetId];
  game.hp[targetId] -= amount;
  pushWeatherEffectEvent(game, {
    type: 'instant_damage',
    sourcePlayerId: sourceId,
    targetPlayerId: targetId,
    amount,
    hpBefore: before,
    hpAfter: game.hp[targetId],
  });
  if (sourceName) {
    logWeather(game, '天气效果触发');
  }
  return amount;
}

function ensureWeatherState(room, game) {
  if (game.weather && game.weatherState) return;

  game.weather = {
    stageRound: 0,
    weatherId: null,
    weatherName: null,
    weatherType: null,
    enteredAtRound: null,
    candidates: [],
  };

  game.weatherState = {
    stageAttackLevelBonus: toPlayerMap(room, 0),
    stageDefenseLevelBonus: toPlayerMap(room, 0),
    stagePowerGranted: toPlayerMap(room, 0),
    pendingDefenseBonus: toPlayerMap(room, 0),
    activeDefenseBonus: toPlayerMap(room, 0),
    pendingResilienceBonus: toPlayerMap(room, 0),
    activeResilienceBonus: toPlayerMap(room, 0),
    attackRerolledInRound: toPlayerMap(room, false),
  };
}

function addStageLevelBonus(game, playerId, attackBonus, defenseBonus) {
  const st = game.weatherState;
  if (attackBonus) {
    game.attackLevel[playerId] += attackBonus;
    st.stageAttackLevelBonus[playerId] += attackBonus;
  }
  if (defenseBonus) {
    game.defenseLevel[playerId] += defenseBonus;
    st.stageDefenseLevelBonus[playerId] += defenseBonus;
  }
}

function addStagePower(game, playerId, amount) {
  if (!amount) return;
  const st = game.weatherState;
  game.power[playerId] += amount;
  st.stagePowerGranted[playerId] += amount;
}

function clearStageBonuses(room, game) {
  const st = game.weatherState;
  for (const p of room.players) {
    const pid = p.id;
    if (st.stageAttackLevelBonus[pid] > 0) {
      game.attackLevel[pid] -= st.stageAttackLevelBonus[pid];
      if (game.attackLevel[pid] < 1) game.attackLevel[pid] = 1;
      st.stageAttackLevelBonus[pid] = 0;
    }
    if (st.stageDefenseLevelBonus[pid] > 0) {
      game.defenseLevel[pid] -= st.stageDefenseLevelBonus[pid];
      if (game.defenseLevel[pid] < 1) game.defenseLevel[pid] = 1;
      st.stageDefenseLevelBonus[pid] = 0;
    }
    if (st.stagePowerGranted[pid] > 0) {
      game.power[pid] -= st.stagePowerGranted[pid];
      if (game.power[pid] < 0) game.power[pid] = 0;
      st.stagePowerGranted[pid] = 0;
    }
  }
}

function clearRoundBonuses(room, game) {
  const st = game.weatherState;
  for (const p of room.players) {
    const pid = p.id;
    if (st.activeDefenseBonus[pid] > 0) {
      game.defenseLevel[pid] -= st.activeDefenseBonus[pid];
      if (game.defenseLevel[pid] < 1) game.defenseLevel[pid] = 1;
      st.activeDefenseBonus[pid] = 0;
    }
    if (st.activeResilienceBonus[pid] > 0) {
      game.resilience[pid] -= st.activeResilienceBonus[pid];
      if (game.resilience[pid] < 0) game.resilience[pid] = 0;
      st.activeResilienceBonus[pid] = 0;
    }
  }
}

function promotePendingRoundBonuses(room, game) {
  const st = game.weatherState;
  for (const p of room.players) {
    const pid = p.id;
    if (st.pendingDefenseBonus[pid] > 0) {
      const amount = st.pendingDefenseBonus[pid];
      st.pendingDefenseBonus[pid] = 0;
      st.activeDefenseBonus[pid] += amount;
      game.defenseLevel[pid] += amount;
    logWeather(game, '天气效果触发');
    }
    if (st.pendingResilienceBonus[pid] > 0) {
      const amount = st.pendingResilienceBonus[pid];
      st.pendingResilienceBonus[pid] = 0;
      st.activeResilienceBonus[pid] += amount;
      game.resilience[pid] += amount;
    logWeather(game, '天气效果触发');
    }
  }
}

function chooseStageWeather(stageRound) {
  const pool = WEATHER_POOLS[stageRound] || [];
  if (!pool.length) return null;
  const id = pool[Math.floor(Math.random() * pool.length)];
  return {
    id,
    pool: pool.slice(),
  };
}

function applyStageEnter(room, game, weatherId) {
  const w = WEATHER_DEFS[weatherId];
  if (!w) return;

  if (weatherId === 'heavy_rain') {
    for (const p of room.players) {
      addStageLevelBonus(game, p.id, 1, 1);
    }
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'cloud_sea') {
    for (const p of room.players) {
      game.auroraUsesRemaining[p.id] += 1;
    }
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'clear') {
    for (const p of room.players) {
      addStagePower(game, p.id, 5);
    }
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'toxic_fog') {
    for (const p of room.players) {
      game.poison[p.id] += 2;
    }
    logWeather(game, '天气效果触发');
  }
}

function applyRoundStart(room, game) {
  const weatherId = getCurrentWeatherId(game);
  if (!weatherId) return;

  if (weatherId === 'acid_rain') {
    const [p1, p2] = room.players;
    const hp1 = game.hp[p1.id];
    const hp2 = game.hp[p2.id];
    if (hp1 !== hp2) {
      const target = hp1 > hp2 ? p1 : p2;
      game.poison[target.id] += 1;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'high_temp') {
    const [p1, p2] = room.players;
    const hp1 = game.hp[p1.id];
    const hp2 = game.hp[p2.id];
    if (hp1 !== hp2) {
      const target = hp1 < hp2 ? p1 : p2;
      addStagePower(game, target.id, 2);
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'sleet') {
    for (const p of room.players) {
      if (game.hp[p.id] < game.maxHp[p.id]) {
        game.counterActive[p.id] = true;
        game.weatherState.activeDefenseBonus[p.id] += 2;
        game.defenseLevel[p.id] += 2;
    logWeather(game, '天气效果触发');
      }
    }
  }
}

function updateWeatherForNewRound(room, game) {
  ensureWeatherState(room, game);
  clearRoundBonuses(room, game);

  const stageRound = getStageRoundByRound(game.round);
  if (isInStageGate(game.round) && stageRound !== game.weather.stageRound) {
    clearStageBonuses(room, game);
    const picked = chooseStageWeather(stageRound);
    if (picked) {
      const weather = WEATHER_DEFS[picked.id];
      game.weather.stageRound = stageRound;
      game.weather.weatherId = picked.id;
      game.weather.weatherName = weather ? weather.name : picked.id;
      game.weather.weatherType = weather ? weather.type : '';
      game.weather.enteredAtRound = game.round;
      game.weather.candidates = picked.pool;
    logWeather(game, '天气效果触发');
      applyStageEnter(room, game, picked.id);
    } else {
      game.weather.stageRound = stageRound;
      game.weather.weatherId = null;
      game.weather.weatherName = null;
      game.weather.weatherType = null;
      game.weather.enteredAtRound = game.round;
      game.weather.candidates = [];
    logWeather(game, '天气效果触发');
    }
  }

  promotePendingRoundBonuses(room, game);
  applyRoundStart(room, game);

  for (const p of room.players) {
    game.weatherState.attackRerolledInRound[p.id] = false;
  }
}

function onEndCurrentRound(room, game, endingAttackerId) {
  ensureWeatherState(room, game);
  const weatherId = getCurrentWeatherId(game);
  if (!weatherId) return;

  if (weatherId === 'light_snow') {
    if (!game.weatherState.attackRerolledInRound[endingAttackerId]) {
      game.weatherState.pendingResilienceBonus[endingAttackerId] += 3;
      const p = room.players.find((player) => player.id === endingAttackerId);
      if (p) {
    logWeather(game, '天气效果触发');
      }
    }
  }
}

function getAttackRerollBonus(game) {
  const weatherId = getCurrentWeatherId(game);
  if (weatherId === 'fish_rain') return 1;
  if (weatherId === 'illusion_sun') return 2;
  return 0;
}

function applySingleDieConstraints(room, game, die, role) {
  const weatherId = getCurrentWeatherId(game);
  let nextDie = die;
  if (!weatherId) return nextDie;

  if (weatherId === 'frog_rain') {
    nextDie = applyNoMinConstraint(nextDie);
  }
  if (weatherId === 'sunny_rain' && role === 'defense') {
    nextDie = applyNoMaxConstraint(nextDie);
  }
  return nextDie;
}

function applyDiceConstraints(room, game, dice, role) {
  if (!Array.isArray(dice) || !dice.length) return dice;
  for (let i = 0; i < dice.length; i += 1) {
    dice[i] = applySingleDieConstraints(room, game, dice[i], role);
  }
  return dice;
}

function onAttackReroll(room, game, attacker) {
  ensureWeatherState(room, game);
  game.weatherState.attackRerolledInRound[attacker.id] = true;
  const weatherId = getCurrentWeatherId(game);
  if (weatherId === 'illusion_sun') {
    game.thorns[attacker.id] += 2;
    logWeather(game, '天气效果触发');
  }
}

function onAttackSelect(room, game, attacker, defender, selectedDice) {
  const weatherId = getCurrentWeatherId(game);
  if (!weatherId) return;

  if (weatherId === 'frost') {
    if (hasDuplicates(selectedDice)) {
      game.weatherState.pendingDefenseBonus[attacker.id] += 1;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'gale') {
    game.extraAttackQueued = true;
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'eclipse') {
    if (!areAllSame(selectedDice)) {
      game.attackValue += 4;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'thunder_rain') {
    game.attackValue += 4;
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'mid_snow') {
    if (hasTriplet(selectedDice)) {
      healPlayer(game, attacker.id, 10, '涓洩');
    }
    return;
  }

  if (weatherId === 'big_snow') {
    if (includesValue(selectedDice, 7)) {
      game.attackValue += 4;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'sandstorm') {
    if (countOddValues(selectedDice) === selectedDice.length && selectedDice.length > 0) {
      game.power[attacker.id] += 3;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'rainbow') {
    if (game.attackValue <= 10) {
      game.attackPierce = true;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'drought') {
    const add = (game.defenseLevel[defender.id] || 0) * 3;
    if (add > 0) {
      game.attackValue += add;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'sun_moon') {
    if (game.hp[attacker.id] <= 3) {
      game.attackValue *= 2;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'sunbeam') {
    if (game.hp[attacker.id] < game.hp[defender.id]) {
      game.extraAttackQueued = true;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'clear_thunder') {
    instantDamage(game, attacker.id, defender.id, 3, '鏅撮浄');
  }
}

function onDefenseSelect(room, game, defender, selectedDice) {
  const weatherId = getCurrentWeatherId(game);
  if (!weatherId) return;

  if (weatherId === 'thunder_rain') {
    game.defenseValue += 4;
    logWeather(game, '天气效果触发');
    return;
  }

  if (weatherId === 'blizzard') {
    if (game.defenseValue < 8) {
      game.forceField[defender.id] = true;
    logWeather(game, '天气效果触发');
    }
    return;
  }

  if (weatherId === 'mid_snow') {
    if (hasTriplet(selectedDice)) {
      healPlayer(game, defender.id, 10, '涓洩');
    }
    return;
  }

  if (weatherId === 'big_snow') {
    if (includesValue(selectedDice, 7)) {
      game.defenseValue += 4;
    logWeather(game, '天气效果触发');
    }
  }
}

function onAfterDamageResolved(room, game, attacker, defender, totalDamage) {
  const weatherId = getCurrentWeatherId(game);
  if (!weatherId) return;

  if (weatherId === 'scorching_sun') {
    if (totalDamage > 0) {
      const heal = Math.floor(totalDamage * 0.5);
      healPlayer(game, attacker.id, heal, '鐑堟棩');
    }
    return;
  }

  if (weatherId === 'spacetime_storm') {
    const selected = (game.attackSelection || []).map((idx) => game.attackDice[idx]).filter(Boolean);
    if (selected.length > 0 && areAllValuesSix(selected)) {
      const aBefore = game.hp[attacker.id];
      const dBefore = game.hp[defender.id];
      game.hp[attacker.id] = dBefore;
      game.hp[defender.id] = aBefore;
    logWeather(game, '天气效果触发');
    }
  }
}

module.exports = {
  WEATHER_POOLS,
  WEATHER_DEFS,
  getWeatherCatalogSummary,
  ensureWeatherState,
  getStageRoundByRound,
  getCurrentWeather,
  updateWeatherForNewRound,
  onEndCurrentRound,
  getAttackRerollBonus,
  applySingleDieConstraints,
  applyDiceConstraints,
  onAttackReroll,
  onAttackSelect,
  onDefenseSelect,
  onAfterDamageResolved,
};


