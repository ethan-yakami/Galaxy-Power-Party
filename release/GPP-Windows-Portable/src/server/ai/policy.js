const {
  enumerateActions,
  getActionOpcode,
  OPCODES,
} = require('../../core/battle-engine');
const { getDifficultyConfig } = require('./config');
const { scoreActionLocal } = require('./evaluator');
const { applyTacticalOverrides } = require('./tactical-overrides');
const { pickCandidateActions, searchBestAction } = require('./search');

const DEFAULT_ACTION_BUFFER_SIZE = 128;

function getPhaseOpcodes(phase) {
  switch (phase) {
    case 0:
      return [OPCODES.ROLL_ATTACK];
    case 1:
      return [OPCODES.USE_AURORA_ATTACK, OPCODES.REROLL_ATTACK, OPCODES.CONFIRM_ATTACK];
    case 2:
      return [OPCODES.ROLL_DEFENSE];
    case 3:
      return [OPCODES.USE_AURORA_DEFENSE, OPCODES.CONFIRM_DEFENSE];
    default:
      return [];
  }
}

function chooseBestLocalLegalAction(state, actionBuffer, count, aiIndex, validOpcodes, difficultyId) {
  const allowed = new Set(Array.isArray(validOpcodes) ? validOpcodes : []);
  let bestAction = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (!allowed.has(getActionOpcode(action))) continue;
    const score = scoreActionLocal(state, action, aiIndex, { difficultyId });
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }
  return bestAction;
}

function choosePureActionForState(state, aiIndex, options = {}) {
  const difficulty = getDifficultyConfig(options.difficultyId);
  const actionBuffer = options.actionBuffer || new Uint16Array(DEFAULT_ACTION_BUFFER_SIZE);
  const count = Number.isInteger(options.count) ? options.count : enumerateActions(state, actionBuffer);
  const validOpcodes = Array.isArray(options.validOpcodes) && options.validOpcodes.length > 0
    ? options.validOpcodes.slice()
    : getPhaseOpcodes(state.phase);
  const allowed = new Set(validOpcodes);

  if (!count || validOpcodes.length === 0) {
    return {
      action: 0,
      count,
      candidates: [],
      selectedBy: 'no_legal_actions',
    };
  }

  const candidates = pickCandidateActions(state, actionBuffer, count, aiIndex, state.phase, difficulty.id)
    .filter((candidate) => allowed.has(candidate.opcode));

  if (difficulty.useTacticalOverrides) {
    const override = applyTacticalOverrides(state, candidates, aiIndex, options.phaseLabel || state.phase, {
      difficultyId: difficulty.id,
      modelPath: options.modelPath,
    });
    if (override && allowed.has(getActionOpcode(override))) {
      return {
        action: override,
        count,
        candidates,
        selectedBy: 'tactical_override',
      };
    }
  }

  if (candidates.length > 0) {
    const samples = state.phase === 1
      ? difficulty.searchSamplesAttack
      : (state.phase === 3 ? difficulty.searchSamplesDefense : 0);
    const searched = searchBestAction(state, candidates, aiIndex, {
      samples,
      maxDecisionMs: difficulty.maxDecisionMs,
      difficultyId: difficulty.id,
      replyTopK: difficulty.replyTopK,
      modelPath: options.modelPath,
    });
    if (searched && allowed.has(getActionOpcode(searched))) {
      return {
        action: searched,
        count,
        candidates,
        selectedBy: samples > 0 ? 'search' : 'local_eval',
      };
    }
  }

  const heuristicAction = chooseBestLocalLegalAction(state, actionBuffer, count, aiIndex, validOpcodes, difficulty.id);
  if (heuristicAction && allowed.has(getActionOpcode(heuristicAction))) {
    return {
      action: heuristicAction,
      count,
      candidates,
      selectedBy: 'heuristic_local',
    };
  }

  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (allowed.has(getActionOpcode(action))) {
      return {
        action,
        count,
        candidates,
        selectedBy: 'fallback_first_legal',
      };
    }
  }

  return {
    action: 0,
    count,
    candidates,
    selectedBy: 'fallback_none',
  };
}

module.exports = {
  DEFAULT_ACTION_BUFFER_SIZE,
  getPhaseOpcodes,
  choosePureActionForState,
};
