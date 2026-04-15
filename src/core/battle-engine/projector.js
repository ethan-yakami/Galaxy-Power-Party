const { SOURCE_AURORA, PHASE_NAMES, STATUS_ENDED, VALUE_NONE } = require('./constants');

function toPlayerMap(state, playerIds, typedArray) {
  return {
    [playerIds[0]]: typedArray[0],
    [playerIds[1]]: typedArray[1],
  };
}

function toBoolPlayerMap(state, playerIds, typedArray) {
  return {
    [playerIds[0]]: !!typedArray[0],
    [playerIds[1]]: !!typedArray[1],
  };
}

function buildDie(state, roll, index) {
  if (roll.sourceKinds[index] === SOURCE_AURORA) {
    const aurora = state.catalog.auroras[roll.auroraIndices[index]];
    return {
      value: roll.values[index],
      label: roll.hasA[index] ? `${roll.values[index]}A` : `${roll.values[index]}`,
      hasA: !!roll.hasA[index],
      isAurora: true,
      sides: null,
      maxValue: roll.maxValues[index],
      slotId: null,
      auroraId: aurora.id,
      auroraName: aurora.name,
      effectText: aurora.effectText,
      conditionText: aurora.conditionText,
    };
  }

  return {
    value: roll.values[index],
    label: `${roll.values[index]}`,
    hasA: false,
    isAurora: false,
    sides: roll.maxValues[index],
    maxValue: roll.maxValues[index],
    slotId: roll.slotIndices[index],
    auroraId: null,
    auroraName: null,
    effectText: null,
    conditionText: null,
  };
}

function buildDiceList(state, roll) {
  if (!roll || !roll.count) return null;
  const out = [];
  for (let i = 0; i < roll.count; i += 1) {
    out.push(buildDie(state, roll, i));
  }
  return out;
}

function buildWeatherView(state) {
  if (state.weatherIndex == null || state.weatherIndex < 0) {
    return {
      stageRound: state.weatherStageRound || 0,
      weatherId: null,
      weatherName: null,
      weatherType: null,
      enteredAtRound: null,
      candidates: [],
    };
  }
  const def = state.catalog.weatherDefs[state.weatherIndex];
  const candidates = [];
  for (let i = 0; i < state.weatherCandidateCount; i += 1) {
    const weatherIndex = state.weatherCandidates[i];
    if (weatherIndex < 0) continue;
    const item = state.catalog.weatherDefs[weatherIndex];
    if (item) candidates.push(item.id);
  }
  return {
    weatherId: def.id,
    weatherName: def.name,
    weatherType: def.type,
    stageRound: state.weatherStageRound || 0,
    enteredAtRound: state.weatherEnteredRound || 0,
    candidates,
  };
}

function buildPendingActionView(options) {
  const pending = options && options.pendingAction ? options.pendingAction : null;
  return {
    pendingActorId: pending && pending.actorId ? pending.actorId : null,
    pendingActionKind: pending && pending.kind ? pending.kind : null,
    pendingActionLabel: pending && pending.label ? pending.label : null,
    isAiThinking: !!(pending && pending.isAiThinking),
  };
}

function projectStateToLegacyRoom(state, roomSessionUi, options) {
  const playerIds = roomSessionUi.indexToPlayerId;
  const pendingView = buildPendingActionView(options);
  return {
    status: state.status === STATUS_ENDED ? 'ended' : 'in_game',
    round: state.round,
    attackerId: playerIds[state.attacker],
    defenderId: playerIds[state.defender],
    phase: PHASE_NAMES[state.phase],
    rerollsLeft: state.rerollsLeft,
    attackDice: buildDiceList(state, state.attackRoll),
    defenseDice: buildDiceList(state, state.defenseRoll),
    attackSelection: state.attackSelectionMask ? state.catalog.indicesByMask[state.attackSelectionMask].slice() : null,
    defenseSelection: state.defenseSelectionMask ? state.catalog.indicesByMask[state.defenseSelectionMask].slice() : null,
    attackPreviewSelection: roomSessionUi.attackPreviewMask ? state.catalog.indicesByMask[roomSessionUi.attackPreviewMask].slice() : [],
    defensePreviewSelection: roomSessionUi.defensePreviewMask ? state.catalog.indicesByMask[roomSessionUi.defensePreviewMask].slice() : [],
    attackValue: state.attackValue === VALUE_NONE ? null : state.attackValue,
    defenseValue: state.defenseValue === VALUE_NONE ? null : state.defenseValue,
    attackPierce: !!state.attackPierce,
    lastDamage: state.lastDamage === VALUE_NONE ? null : state.lastDamage,
    winnerId: state.winner >= 0 ? playerIds[state.winner] : null,
    log: roomSessionUi.logs,
    hp: toPlayerMap(state, playerIds, state.hp),
    maxHp: toPlayerMap(state, playerIds, state.maxHp),
    attackLevel: toPlayerMap(state, playerIds, state.attackLevel),
    defenseLevel: toPlayerMap(state, playerIds, state.defenseLevel),
    auroraUsesRemaining: toPlayerMap(state, playerIds, state.auroraUsesRemaining),
    selectedFourCount: toPlayerMap(state, playerIds, state.selectedFourCount),
    selectedOneCount: toPlayerMap(state, playerIds, state.selectedOneCount),
    overload: toPlayerMap(state, playerIds, state.overload),
    desperateBonus: toPlayerMap(state, playerIds, state.desperateBonus),
    auroraAEffectCount: toPlayerMap(state, playerIds, state.auroraAEffectCount),
    roundAuroraUsed: toBoolPlayerMap(state, playerIds, state.roundAuroraUsed),
    forceField: toBoolPlayerMap(state, playerIds, state.forceField),
    whiteeGuardUsed: toBoolPlayerMap(state, playerIds, state.whiteeGuardUsed),
    whiteeGuardActive: toBoolPlayerMap(state, playerIds, state.whiteeGuardActive),
    unyielding: toBoolPlayerMap(state, playerIds, state.unyielding),
    counterActive: toBoolPlayerMap(state, playerIds, state.counterActive),
    effectEvents: roomSessionUi.effectEvents,
    weather: buildWeatherView(state),
    poison: toPlayerMap(state, playerIds, state.poison),
    resilience: toPlayerMap(state, playerIds, state.resilience),
    thorns: toPlayerMap(state, playerIds, state.thorns),
    power: toPlayerMap(state, playerIds, state.power),
    hackActive: toBoolPlayerMap(state, playerIds, state.hackActive),
    danhengCounterReady: toBoolPlayerMap(state, playerIds, state.danhengCounterReady),
    xilianCumulative: toPlayerMap(state, playerIds, state.xilianCumulative),
    xilianAscensionActive: toBoolPlayerMap(state, playerIds, state.xilianAscensionActive),
    yaoguangRerollsUsed: toPlayerMap(state, playerIds, state.yaoguangRerollsUsed),
    pendingActorId: pendingView.pendingActorId,
    pendingActionKind: pendingView.pendingActionKind,
    pendingActionLabel: pendingView.pendingActionLabel,
    isAiThinking: pendingView.isAiThinking,
    pendingWeatherChanged: null,
  };
}

module.exports = {
  projectStateToLegacyRoom,
};
