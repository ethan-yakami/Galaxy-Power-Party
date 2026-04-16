const {
  cloneState,
  applyActionInPlace,
  getActionOpcode,
  OPCODES,
} = require('../../core/battle-engine');
const { getDifficultyConfig } = require('./config');
const {
  evaluateState,
  extractFeatures,
  getWeatherContext,
} = require('./evaluator');

function findImmediateWin(state, candidates, aiIndex) {
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const next = cloneState(state);
    try {
      applyActionInPlace(next, candidate.action);
    } catch {
      continue;
    }
    if (next.winner === aiIndex) return candidate.action;
  }
  return 0;
}

function evaluateCandidateResult(state, candidate, aiIndex, options = {}) {
  const next = cloneState(state);
  try {
    applyActionInPlace(next, candidate.action);
  } catch {
    return null;
  }
  return {
    candidate,
    next,
    score: evaluateState(next, aiIndex, {
      difficultyId: options.difficultyId,
      modelPath: options.modelPath,
    }),
  };
}

function findEmergencyDefense(state, candidates, aiIndex, options = {}) {
  if (state.phase !== 3) return 0;
  const opponentIndex = aiIndex === 0 ? 1 : 0;
  const incoming = Math.max(0, (state.attackValue || 0) - (state.defenseValue || 0));
  if ((state.hp[aiIndex] || 0) > incoming) return 0;

  let bestAction = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (getActionOpcode(candidate.action) !== OPCODES.CONFIRM_DEFENSE
      && getActionOpcode(candidate.action) !== OPCODES.USE_AURORA_DEFENSE) continue;
    const evaluated = evaluateCandidateResult(state, candidate, aiIndex, options);
    if (!evaluated) continue;
    const survived = (evaluated.next.hp[aiIndex] || 0) > 0
      || evaluated.next.winner === aiIndex
      || evaluated.next.winner < 0;
    const score = (survived ? 5000 : -5000) + evaluated.score - ((evaluated.next.hp[opponentIndex] || 0) * 0.5);
    if (score > bestScore) {
      bestScore = score;
      bestAction = candidate.action;
    }
  }
  return bestAction;
}

function pickBestCandidate(candidates, predicate, scoredCandidates) {
  let best = null;
  for (let i = 0; i < scoredCandidates.length; i += 1) {
    const item = scoredCandidates[i];
    if (!item || !item.candidate) continue;
    if (predicate && !predicate(item)) continue;
    if (!best || item.score > best.score) best = item;
  }
  return best;
}

function findWeatherAttackOverride(state, candidates, aiIndex, weather, options) {
  if (state.phase !== 1) return 0;
  const scored = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const opcode = getActionOpcode(candidates[i].action);
    if (opcode !== OPCODES.CONFIRM_ATTACK && opcode !== OPCODES.REROLL_ATTACK) continue;
    const evaluated = evaluateCandidateResult(state, candidates[i], aiIndex, options);
    if (evaluated) scored.push(evaluated);
  }
  if (!scored.length) return 0;

  if (weather.weatherId === 'light_snow') {
    const bestConfirm = pickBestCandidate(candidates, (item) => getActionOpcode(item.candidate.action) === OPCODES.CONFIRM_ATTACK, scored);
    const bestReroll = pickBestCandidate(candidates, (item) => getActionOpcode(item.candidate.action) === OPCODES.REROLL_ATTACK, scored);
    if (bestConfirm && (!bestReroll || bestConfirm.score >= (bestReroll.score - 8))) {
      return bestConfirm.candidate.action;
    }
  }

  if (weather.weatherId === 'illusion_sun') {
    const bestReroll = pickBestCandidate(candidates, (item) => getActionOpcode(item.candidate.action) === OPCODES.REROLL_ATTACK, scored);
    const bestConfirm = pickBestCandidate(candidates, (item) => getActionOpcode(item.candidate.action) === OPCODES.CONFIRM_ATTACK, scored);
    if (bestReroll && (
      !bestConfirm
      || (state.hp[aiIndex] || 0) < (state.hp[aiIndex === 0 ? 1 : 0] || 0)
      || bestReroll.score >= (bestConfirm.score - 10)
    )) {
      return bestReroll.candidate.action;
    }
  }

  if (weather.weatherId === 'spacetime_storm') {
    const bestSixLine = pickBestCandidate(candidates, (item) => item.candidate.weatherTag === 'spacetime_storm_six_line', scored);
    if (bestSixLine && (state.hp[aiIndex] || 0) + 6 <= (state.hp[aiIndex === 0 ? 1 : 0] || 0)) {
      return bestSixLine.candidate.action;
    }
  }

  return 0;
}

function findWeatherDefenseOverride(state, candidates, aiIndex, weather, options) {
  if (state.phase !== 3) return 0;
  const scored = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const opcode = getActionOpcode(candidates[i].action);
    if (opcode !== OPCODES.CONFIRM_DEFENSE && opcode !== OPCODES.USE_AURORA_DEFENSE) continue;
    const evaluated = evaluateCandidateResult(state, candidates[i], aiIndex, options);
    if (evaluated && (evaluated.next.hp[aiIndex] || 0) > 0) scored.push(evaluated);
  }
  if (!scored.length) return 0;

  const safest = pickBestCandidate(candidates, null, scored);
  let tactical = null;

  if (weather.weatherId === 'sun_moon') {
    tactical = pickBestCandidate(candidates, (item) => (item.next.hp[aiIndex] || 0) > 0 && (item.next.hp[aiIndex] || 0) <= 3, scored);
  } else if (weather.weatherId === 'sunbeam' || weather.weatherId === 'high_temp') {
    tactical = pickBestCandidate(
      candidates,
      (item) => (item.next.hp[aiIndex] || 0) > 0 && (item.next.hp[aiIndex] || 0) < (item.next.hp[aiIndex === 0 ? 1 : 0] || 0),
      scored,
    );
  } else if (weather.weatherId === 'acid_rain') {
    tactical = pickBestCandidate(
      candidates,
      (item) => (item.next.hp[aiIndex] || 0) > 0 && (item.next.hp[aiIndex] || 0) <= (item.next.hp[aiIndex === 0 ? 1 : 0] || 0),
      scored,
    );
  }

  if (tactical && (!safest || tactical.score >= safest.score)) {
    return tactical.candidate.action;
  }
  return 0;
}

function applyTacticalOverrides(state, candidates, aiIndex, phase, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  const difficulty = getDifficultyConfig(options.difficultyId);
  const directWin = findImmediateWin(state, candidates, aiIndex);
  if (directWin) return directWin;

  if (phase === 3 || phase === 'defense_select') {
    const emergencyDefense = findEmergencyDefense(state, candidates, aiIndex, options);
    if (emergencyDefense) return emergencyDefense;
  }

  const features = extractFeatures(state, aiIndex);
  if (features.hpLead >= 10) {
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (getActionOpcode(candidate.action) === OPCODES.REROLL_ATTACK) continue;
      return candidate.action;
    }
  }

  if (!(difficulty && difficulty.riskProfile === 'calculated')) return 0;
  const weather = getWeatherContext(state, aiIndex);

  if (phase === 1 || phase === 'attack_reroll_or_select') {
    return findWeatherAttackOverride(state, candidates, aiIndex, weather, options);
  }
  if (phase === 3 || phase === 'defense_select') {
    return findWeatherDefenseOverride(state, candidates, aiIndex, weather, options);
  }

  return 0;
}

module.exports = {
  applyTacticalOverrides,
};
