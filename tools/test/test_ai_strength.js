const { performance } = require('perf_hooks');

const {
  createBattle,
  applyActionInPlace,
  isTerminal,
} = require('../../src/core/battle-engine');
const { RESTRICTED_AI_LOADOUTS } = require('../../src/server/ai/config');
const { choosePureActionForState } = require('../../src/server/ai');
const { loadValueModel } = require('../../src/server/ai/model/runtime');

function parseArgs(argv) {
  const options = {
    games: 1000,
    maxSteps: 256,
    modelPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--games' && next) {
      options.games = Math.max(1, Number.parseInt(next, 10) || options.games);
      i += 1;
    } else if (arg === '--max-steps' && next) {
      options.maxSteps = Math.max(1, Number.parseInt(next, 10) || options.maxSteps);
      i += 1;
    } else if (arg === '--model' && next) {
      options.modelPath = next;
      i += 1;
    }
  }
  return options;
}

function percentile(values, q) {
  if (!values.length) return 0;
  const copy = values.slice().sort((a, b) => a - b);
  const index = Math.min(copy.length - 1, Math.max(0, Math.floor(q * (copy.length - 1))));
  return copy[index];
}

function currentActorIndex(state) {
  return (state.phase === 2 || state.phase === 3) ? state.defender : state.attacker;
}

function loadoutAt(index) {
  return RESTRICTED_AI_LOADOUTS[index % RESTRICTED_AI_LOADOUTS.length];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const model = loadValueModel({ path: options.modelPath });
  if (!model) {
    console.error('test_ai_strength requires a valid value model');
    process.exit(1);
  }

  let eliteWins = 0;
  let hardWins = 0;
  let draws = 0;
  let eliteHpMarginSum = 0;
  const decisionTimes = [];
  const matchupStats = new Map();

  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const eliteIndex = gameIndex % 2;
    const loadoutElite = loadoutAt(gameIndex);
    const loadoutHard = loadoutAt((gameIndex * 7) + 3);
    const players = eliteIndex === 0
      ? [loadoutElite, loadoutHard]
      : [loadoutHard, loadoutElite];
    const state = createBattle({ players }, `ai-strength:${gameIndex}`, {
      startingAttacker: gameIndex % 2,
    });

    let steps = 0;
    while (!isTerminal(state) && steps < options.maxSteps) {
      const actorIndex = currentActorIndex(state);
      const difficultyId = actorIndex === eliteIndex ? 'elite' : 'hard';
      const startedAt = performance.now();
      const decision = choosePureActionForState(state, actorIndex, {
        difficultyId,
        modelPath: options.modelPath,
      });
      decisionTimes.push(performance.now() - startedAt);
      if (!decision.action) break;
      applyActionInPlace(state, decision.action);
      steps += 1;
    }

    const eliteHp = state.hp[eliteIndex] || 0;
    const hardHp = state.hp[eliteIndex === 0 ? 1 : 0] || 0;
    eliteHpMarginSum += eliteHp - hardHp;

    const matchupKey = `${loadoutElite.characterId}:${loadoutElite.auroraDiceId || ''} vs ${loadoutHard.characterId}:${loadoutHard.auroraDiceId || ''}`;
    const entry = matchupStats.get(matchupKey) || { games: 0, eliteWins: 0, hardWins: 0, draws: 0 };
    entry.games += 1;

    if (state.winner === eliteIndex) {
      eliteWins += 1;
      entry.eliteWins += 1;
    } else if (state.winner === (eliteIndex === 0 ? 1 : 0)) {
      hardWins += 1;
      entry.hardWins += 1;
    } else {
      draws += 1;
      entry.draws += 1;
    }
    matchupStats.set(matchupKey, entry);
  }

  const avgDecisionMs = decisionTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, decisionTimes.length);
  const summary = {
    ok: true,
    games: options.games,
    eliteWins,
    hardWins,
    draws,
    eliteWinRate: eliteWins / Math.max(1, options.games),
    averageHpMargin: eliteHpMarginSum / Math.max(1, options.games),
    averageDecisionMs: avgDecisionMs,
    p95DecisionMs: percentile(decisionTimes, 0.95),
    matchups: Array.from(matchupStats.entries())
      .map(([matchup, stats]) => ({ matchup, ...stats }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 20),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
