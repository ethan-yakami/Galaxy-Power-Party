const assert = require('assert');

const {
  createBattle,
  cloneState,
  enumerateActions,
  applyActionInPlace,
  getActionOpcode,
  OPCODES,
} = require('../../src/core/battle-engine');
const { pickCandidateActions, searchBestAction } = require('../../src/server/ai/search');
const { applyTacticalOverrides } = require('../../src/server/ai/tactical-overrides');
const { evaluateState } = require('../../src/server/ai/evaluator');

function chooseActionByOpcode(actionBuffer, count, opcode) {
  for (let i = 0; i < count; i += 1) {
    if (getActionOpcode(actionBuffer[i]) === opcode) return actionBuffer[i];
  }
  return 0;
}

function main() {
  const state = createBattle({
    players: [
      { characterId: 'baie', auroraDiceId: 'legacy' },
      { characterId: 'daheita', auroraDiceId: 'destiny' },
    ],
  }, 'ai-pipeline-seed', {
    startingAttacker: 0,
  });

  const actionBuffer = new Uint16Array(128);
  let count = enumerateActions(state, actionBuffer);
  const rollAttack = chooseActionByOpcode(actionBuffer, count, OPCODES.ROLL_ATTACK);
  assert.ok(rollAttack, 'attack roll action should exist');
  applyActionInPlace(state, rollAttack);

  count = enumerateActions(state, actionBuffer);
  const candidates = pickCandidateActions(state, actionBuffer, count, state.attacker, state.phase, 'hard');
  assert.ok(candidates.length > 0, 'candidate picker should return actions');
  assert.ok(candidates.length <= 5, 'hard attack candidate list should stay trimmed');
  candidates.forEach((candidate) => {
    assert.ok([
      OPCODES.USE_AURORA_ATTACK,
      OPCODES.REROLL_ATTACK,
      OPCODES.CONFIRM_ATTACK,
    ].includes(candidate.opcode), `unexpected attack candidate opcode ${candidate.opcode}`);
    assert.ok(Number.isFinite(candidate.localScore), 'candidate local score should be finite');
  });

  const override = applyTacticalOverrides(state, candidates, state.attacker, state.phase);
  if (override) {
    assert.ok(candidates.some((candidate) => candidate.action === override), 'override must choose from candidate list');
  }

  const chosen = searchBestAction(state, candidates, state.attacker, {
    samples: 8,
    maxDecisionMs: 20,
  });
  assert.ok(candidates.some((candidate) => candidate.action === chosen), 'search should return a candidate action');

  const next = cloneState(state);
  applyActionInPlace(next, chosen);
  const score = evaluateState(next, 0);
  assert.ok(Number.isFinite(score), 'evaluated score should be finite');
  console.log('ai decision pipeline test passed');
}

main();
