const {
  cloneState,
  enumerateActions,
  applyActionInPlace,
  getActionOpcode,
  getActionMask,
  OPCODES,
} = require('../../core/battle-engine');
const { getDifficultyConfig } = require('./config');
const {
  scoreActionLocal,
  evaluateState,
  projectPureGame,
  buildPlayerMeta,
  extractFeatures,
  getWeatherActionBias,
} = require('./evaluator');

function safeNumber(value, fallback = -Infinity) {
  return Number.isFinite(value) ? value : fallback;
}

function dedupeAndSortCandidates(candidates, limit) {
  const byKey = new Map();
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate || !candidate.action) continue;
    const key = `${candidate.opcode}:${candidate.mask}`;
    const current = byKey.get(key);
    if (!current || safeNumber(candidate.localScore) > safeNumber(current.localScore)) {
      byKey.set(key, candidate);
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => {
      if (!!b.weatherPreserve !== !!a.weatherPreserve) return b.weatherPreserve ? 1 : -1;
      return safeNumber(b.localScore) - safeNumber(a.localScore);
    })
    .slice(0, limit);
}

function buildScoredCandidates(state, actionBuffer, count, aiIndex, difficultyId) {
  const game = projectPureGame(state);
  const aiPlayer = buildPlayerMeta(state, aiIndex);
  const features = extractFeatures(state, aiIndex);
  const scored = [];
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    const bias = getWeatherActionBias(state, action, aiIndex, {
      difficultyId,
      game,
      aiPlayer,
      enableWeatherBias: true,
    });
    scored.push({
      action,
      opcode: getActionOpcode(action),
      mask: getActionMask(action),
      localScore: scoreActionLocal(state, action, aiIndex, {
        difficultyId,
        game,
        aiPlayer,
        features,
        enableWeatherBias: true,
      }),
      searchScore: -Infinity,
      finalScore: -Infinity,
      source: bias.tag || 'local',
      weatherPreserve: !!bias.preserve,
      weatherTag: bias.tag || '',
    });
  }
  scored.sort((a, b) => safeNumber(b.localScore) - safeNumber(a.localScore));
  return scored;
}

function pickCandidateActions(state, actionBuffer, count, aiIndex, phase, difficulty) {
  const cfg = getDifficultyConfig(difficulty);
  const candidates = [];
  const weatherExtras = [];
  const rerollLimit = 2;
  const attackConfirmLimit = Math.max(1, cfg.candidateLimitAttack - 1);
  const defenseConfirmLimit = cfg.candidateLimitDefense;
  const attackWeatherExtraLimit = cfg.weatherLookahead ? 2 : 0;
  const defenseWeatherExtraLimit = cfg.weatherLookahead ? 1 : 0;
  let auroraAdded = false;
  let rerollsAdded = 0;
  let attackConfirmsAdded = 0;
  let defenseConfirmsAdded = 0;

  const scored = buildScoredCandidates(state, actionBuffer, count, aiIndex, cfg.id);

  for (let i = 0; i < scored.length; i += 1) {
    const candidate = scored[i];
    if ((phase === 1 || phase === 'attack_reroll_or_select')) {
      if (candidate.opcode === OPCODES.USE_AURORA_ATTACK) {
        if (auroraAdded) continue;
        auroraAdded = true;
        candidates.push(candidate);
        continue;
      }
      if (candidate.opcode === OPCODES.REROLL_ATTACK) {
        if (rerollsAdded >= rerollLimit) {
          if (candidate.weatherPreserve) weatherExtras.push(candidate);
          continue;
        }
        rerollsAdded += 1;
        candidates.push(candidate);
        continue;
      }
      if (candidate.opcode === OPCODES.CONFIRM_ATTACK) {
        if (attackConfirmsAdded >= attackConfirmLimit) {
          if (candidate.weatherPreserve) weatherExtras.push(candidate);
          continue;
        }
        attackConfirmsAdded += 1;
        candidates.push(candidate);
      }
      continue;
    }
    if (phase === 3 || phase === 'defense_select') {
      if (candidate.opcode === OPCODES.USE_AURORA_DEFENSE) {
        if (auroraAdded) continue;
        auroraAdded = true;
        candidates.push(candidate);
        continue;
      }
      if (candidate.opcode === OPCODES.CONFIRM_DEFENSE) {
        if (defenseConfirmsAdded >= defenseConfirmLimit) {
          if (candidate.weatherPreserve) weatherExtras.push(candidate);
          continue;
        }
        defenseConfirmsAdded += 1;
        candidates.push(candidate);
      }
      continue;
    }
    candidates.push(candidate);
  }

  const defaultLimit = phase === 1 || phase === 'attack_reroll_or_select'
    ? cfg.candidateLimitAttack
    : cfg.candidateLimitDefense;
  const weatherExtraLimit = phase === 1 || phase === 'attack_reroll_or_select'
    ? attackWeatherExtraLimit
    : defenseWeatherExtraLimit;
  const merged = dedupeAndSortCandidates(candidates, Math.max(1, defaultLimit));

  if (weatherExtraLimit > 0 && weatherExtras.length > 0) {
    const existingKeys = new Set(merged.map((candidate) => `${candidate.opcode}:${candidate.mask}`));
    const sortedExtras = dedupeAndSortCandidates(weatherExtras, weatherExtraLimit + 2);
    const targetSize = merged.length + weatherExtraLimit;
    for (let i = 0; i < sortedExtras.length && existingKeys.size < targetSize; i += 1) {
      const candidate = sortedExtras[i];
      const key = `${candidate.opcode}:${candidate.mask}`;
      if (existingKeys.has(key)) continue;
      merged.push(candidate);
      existingKeys.add(key);
    }
  }

  return dedupeAndSortCandidates(merged, Math.max(1, defaultLimit + weatherExtraLimit));
}

function pickReplyCandidates(state, aiIndex, actionBuffer, difficultyId, topK) {
  const count = enumerateActions(state, actionBuffer);
  if (!count) return [];
  const game = projectPureGame(state);
  const aiPlayer = buildPlayerMeta(state, aiIndex);
  const features = extractFeatures(state, aiIndex);
  const replies = [];
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    replies.push({
      action,
      score: scoreActionLocal(state, action, aiIndex, {
        difficultyId,
        game,
        aiPlayer,
        features,
        enableWeatherBias: true,
      }),
    });
  }
  replies.sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
  return replies.slice(0, Math.max(1, topK)).map((reply, index) => ({
    action: reply.action,
    weight: 1 / (index + 1),
  }));
}

function searchBestAction(state, candidates, aiIndex, budget = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  const difficulty = getDifficultyConfig(budget.difficultyId);
  const samples = Math.max(0, budget.samples | 0);
  const maxDecisionMs = Math.max(1, budget.maxDecisionMs | 0);
  const replyTopK = Math.max(1, budget.replyTopK || difficulty.replyTopK || 1);
  if (samples <= 0) {
    return dedupeAndSortCandidates(candidates, 1)[0].action;
  }

  const start = Date.now();
  const replyBuffer = new Uint16Array(128);
  let bestAction = candidates[0].action;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    let total = 0;
    let ran = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      if ((Date.now() - start) >= maxDecisionMs) break;
      const next = cloneState(state);
      try {
        applyActionInPlace(next, candidate.action);
      } catch {
        total = -Infinity;
        ran = 1;
        break;
      }

      const actor = (next.phase === 2 || next.phase === 3) ? next.defender : next.attacker;
      if (actor !== aiIndex) {
        const replies = pickReplyCandidates(next, actor, replyBuffer, difficulty.id, replyTopK);
        if (replies.length > 0) {
          let weightedTotal = 0;
          let weightSum = 0;
          for (let j = 0; j < replies.length; j += 1) {
            if ((Date.now() - start) >= maxDecisionMs) break;
            const replyState = cloneState(next);
            try {
              applyActionInPlace(replyState, replies[j].action);
            } catch {
              continue;
            }
            const replyScore = evaluateState(replyState, aiIndex, {
              difficultyId: difficulty.id,
              modelPath: budget.modelPath,
            });
            weightedTotal += replyScore * replies[j].weight;
            weightSum += replies[j].weight;
          }
          total += weightSum > 0
            ? (weightedTotal / weightSum)
            : evaluateState(next, aiIndex, {
              difficultyId: difficulty.id,
              modelPath: budget.modelPath,
            });
        } else {
          total += evaluateState(next, aiIndex, {
            difficultyId: difficulty.id,
            modelPath: budget.modelPath,
          });
        }
      } else {
        total += evaluateState(next, aiIndex, {
          difficultyId: difficulty.id,
          modelPath: budget.modelPath,
        });
      }
      ran += 1;
    }
    const avg = ran > 0 ? total / ran : candidate.localScore;
    candidate.searchScore = avg;
    candidate.finalScore = safeNumber(candidate.localScore, 0) * 0.35 + safeNumber(avg, 0) * 0.65;
    candidate.source = candidate.weatherTag || 'search';
    if (candidate.finalScore > bestScore) {
      bestScore = candidate.finalScore;
      bestAction = candidate.action;
    }
    if ((Date.now() - start) >= maxDecisionMs) break;
  }

  return bestAction;
}

module.exports = {
  pickCandidateActions,
  searchBestAction,
};
