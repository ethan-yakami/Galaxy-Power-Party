const assert = require('assert');

const {
  createBattle,
  cloneState,
  enumerateActions,
  applyActionInPlace,
  getActionOpcode,
  OPCODES,
} = require('../../src/core/battle-engine');
const { choosePureActionForState } = require('../../src/server/ai');
const { extractFeatures, evaluateState } = require('../../src/server/ai/evaluator');

function chooseActionByOpcode(actionBuffer, count, opcode) {
  for (let i = 0; i < count; i += 1) {
    if (getActionOpcode(actionBuffer[i]) === opcode) return actionBuffer[i];
  }
  return 0;
}

function setWeather(state, weatherId, round) {
  state.round = round;
  state.weatherStageRound = round;
  state.weatherEnteredRound = round;
  state.weatherChangedRound = round;
  state.weatherIndex = state.catalog.weatherIndexById[weatherId];
}

function setRollValues(roll, values) {
  for (let i = 0; i < values.length; i += 1) {
    roll.values[i] = values[i];
    if (roll.maxValues[i] < values[i]) roll.maxValues[i] = values[i];
  }
}

function buildAttackSelectState() {
  const state = createBattle({
    players: [
      { characterId: 'zhigengniao', auroraDiceId: null },
      { characterId: 'daheita', auroraDiceId: 'destiny' },
    ],
  }, 'ai-weather-attack', {
    startingAttacker: 0,
  });
  const actionBuffer = new Uint16Array(128);
  const count = enumerateActions(state, actionBuffer);
  const rollAttack = chooseActionByOpcode(actionBuffer, count, OPCODES.ROLL_ATTACK);
  applyActionInPlace(state, rollAttack);
  return state;
}

function buildDefenseSelectState() {
  const state = createBattle({
    players: [
      { characterId: 'daheita', auroraDiceId: 'destiny' },
      { characterId: 'zhigengniao', auroraDiceId: null },
    ],
  }, 'ai-weather-defense', {
    startingAttacker: 0,
  });
  const actionBuffer = new Uint16Array(128);

  let count = enumerateActions(state, actionBuffer);
  const rollAttack = chooseActionByOpcode(actionBuffer, count, OPCODES.ROLL_ATTACK);
  applyActionInPlace(state, rollAttack);

  count = enumerateActions(state, actionBuffer);
  const confirmAttack = chooseActionByOpcode(actionBuffer, count, OPCODES.CONFIRM_ATTACK);
  applyActionInPlace(state, confirmAttack);

  count = enumerateActions(state, actionBuffer);
  const rollDefense = chooseActionByOpcode(actionBuffer, count, OPCODES.ROLL_DEFENSE);
  applyActionInPlace(state, rollDefense);

  return state;
}

function main() {
  const lightSnowState = buildAttackSelectState();
  setWeather(lightSnowState, 'light_snow', 2);
  lightSnowState.rerollsLeft = 1;
  lightSnowState.hp[0] = 10;
  lightSnowState.hp[1] = 15;
  setRollValues(lightSnowState.attackRoll, [4, 4, 5, 6]);
  let decision = choosePureActionForState(lightSnowState, 0, { difficultyId: 'elite' });
  assert.notStrictEqual(getActionOpcode(decision.action), OPCODES.REROLL_ATTACK, 'light_snow should prefer not rerolling');

  const illusionSunState = buildAttackSelectState();
  setWeather(illusionSunState, 'illusion_sun', 2);
  illusionSunState.rerollsLeft = 1;
  illusionSunState.hp[0] = 9;
  illusionSunState.hp[1] = 18;
  setRollValues(illusionSunState.attackRoll, [1, 1, 2, 2]);
  decision = choosePureActionForState(illusionSunState, 0, { difficultyId: 'elite' });
  assert.strictEqual(getActionOpcode(decision.action), OPCODES.REROLL_ATTACK, 'illusion_sun should aggressively reroll weak attack dice');

  const sunMoonState = buildDefenseSelectState();
  setWeather(sunMoonState, 'sun_moon', 6);
  sunMoonState.hp[1] = 7;
  sunMoonState.hp[0] = 18;
  sunMoonState.attackValue = 10;
  sunMoonState.defenseValue = 0;
  setRollValues(sunMoonState.defenseRoll, [1, 1, 6, 6]);
  decision = choosePureActionForState(sunMoonState, 1, { difficultyId: 'elite' });
  const sellHpState = cloneState(sunMoonState);
  applyActionInPlace(sellHpState, decision.action);
  assert.ok(sellHpState.hp[1] > 0 && sellHpState.hp[1] <= 3, 'sun_moon should allow a calculated low-hp defense line');

  const spacetimeState = buildAttackSelectState();
  setWeather(spacetimeState, 'spacetime_storm', 6);
  spacetimeState.hp[0] = 8;
  spacetimeState.hp[1] = 20;
  spacetimeState.rerollsLeft = 1;
  setRollValues(spacetimeState.attackRoll, [6, 6, 6, 6]);
  decision = choosePureActionForState(spacetimeState, 0, { difficultyId: 'elite' });
  assert.strictEqual(getActionOpcode(decision.action), OPCODES.CONFIRM_ATTACK, 'spacetime_storm should keep the six-line when behind');

  const highTempState = buildDefenseSelectState();
  setWeather(highTempState, 'high_temp', 4);
  highTempState.hp[1] = 8;
  highTempState.hp[0] = 15;
  const highTempFeatures = extractFeatures(highTempState, 1);
  assert.ok(highTempFeatures.weatherComebackValue > 0, 'high_temp should value becoming the lower-hp side');

  const acidRainState = buildDefenseSelectState();
  setWeather(acidRainState, 'acid_rain', 4);
  acidRainState.hp[1] = 9;
  acidRainState.hp[0] = 14;
  const acidScore = evaluateState(acidRainState, 1, { difficultyId: 'elite' });
  assert.ok(Number.isFinite(acidScore), 'acid_rain state evaluation should remain finite');

  console.log('ai weather tactics test passed');
}

main();
