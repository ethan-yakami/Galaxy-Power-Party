const fs = require('fs');
const path = require('path');

const {
  createBattle,
  applyActionInPlace,
  isTerminal,
  getActionOpcode,
  getActionMask,
  PHASE_NAMES,
} = require('../../src/core/battle-engine');
const { RESTRICTED_AI_LOADOUTS } = require('../../src/server/ai/config');
const { choosePureActionForState } = require('../../src/server/ai');
const { extractFeatures, buildPlayerMeta } = require('../../src/server/ai/evaluator');

const DEFAULT_GAMES = 200;
const DEFAULT_MAX_SAMPLES_PER_GAME = 8;
const DEFAULT_MAX_STEPS = 256;
const DEFAULT_OUT_PATH = path.join(process.cwd(), 'tmp', 'ai', 'selfplay_dataset.jsonl');

function parseArgs(argv) {
  const options = {
    games: DEFAULT_GAMES,
    maxSamplesPerGame: DEFAULT_MAX_SAMPLES_PER_GAME,
    maxSteps: DEFAULT_MAX_STEPS,
    out: DEFAULT_OUT_PATH,
    difficultyId: 'elite',
    seedBase: 'gpp-selfplay',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--games' && next) {
      options.games = Math.max(1, Number.parseInt(next, 10) || DEFAULT_GAMES);
      i += 1;
    } else if (arg === '--max-samples-per-game' && next) {
      options.maxSamplesPerGame = Math.max(1, Number.parseInt(next, 10) || DEFAULT_MAX_SAMPLES_PER_GAME);
      i += 1;
    } else if (arg === '--max-steps' && next) {
      options.maxSteps = Math.max(1, Number.parseInt(next, 10) || DEFAULT_MAX_STEPS);
      i += 1;
    } else if (arg === '--out' && next) {
      options.out = path.resolve(next);
      i += 1;
    } else if (arg === '--difficulty' && next) {
      options.difficultyId = String(next || 'hard');
      i += 1;
    } else if (arg === '--seed-base' && next) {
      options.seedBase = String(next || options.seedBase);
      i += 1;
    }
  }
  return options;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentActorIndex(state) {
  return (state.phase === 2 || state.phase === 3) ? state.defender : state.attacker;
}

function scoreSamplePriority(state, features) {
  let score = 0;
  if ((features.currentWeatherId || 0) > 0) score += 12;
  if ((features.roundsToNextWeatherGate || 0) <= 1) score += 18;
  if (Math.min(features.aiHp || 0, features.opponentHp || 0) <= 10) score += 18;
  if (Math.abs(features.hpLead || 0) <= 8) score += 8;
  score += Math.max(0, features.weatherTempoValue || 0);
  score += Math.max(0, features.weatherComebackValue || 0);
  score += Math.max(0, features.weatherComboValue || 0);
  score += Math.max(0, features.sellHpWindowValue || 0) * 2;
  return score;
}

function buildResultRecord(state, actorIndex) {
  const opponentIndex = actorIndex === 0 ? 1 : 0;
  const finalActorHp = state.hp[actorIndex] || 0;
  const finalOpponentHp = state.hp[opponentIndex] || 0;
  let outcome = 0;
  if (state.winner === actorIndex) outcome = 1;
  else if (state.winner === opponentIndex) outcome = -1;
  const hpMargin = clamp((finalActorHp - finalOpponentHp) / 30, -1, 1);
  return {
    winnerIndex: state.winner,
    finalActorHp,
    finalOpponentHp,
    outcome,
    hpMargin,
    targetValue: outcome + (0.25 * hpMargin),
  };
}

function generateSelfplayDataset(inputOptions = {}) {
  const options = Object.assign(parseArgs([]), inputOptions || {});
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  const lines = [];

  let totalRows = 0;
  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const loadoutA = randomChoice(RESTRICTED_AI_LOADOUTS);
    const loadoutB = randomChoice(RESTRICTED_AI_LOADOUTS);
    const seed = `${options.seedBase}:${gameIndex}`;
    const state = createBattle({
      players: [loadoutA, loadoutB],
    }, seed, {
      startingAttacker: gameIndex % 2,
    });

    const pendingRows = [];
    let steps = 0;

    while (!isTerminal(state) && steps < options.maxSteps) {
      const actorIndex = currentActorIndex(state);
      const phaseName = PHASE_NAMES[state.phase] || String(state.phase);
      const decision = choosePureActionForState(state, actorIndex, {
        difficultyId: options.difficultyId,
        phaseLabel: phaseName,
      });
      if (!decision.action) break;

      if (state.phase === 1 || state.phase === 3) {
        const actorMeta = buildPlayerMeta(state, actorIndex);
        const opponentMeta = buildPlayerMeta(state, actorIndex === 0 ? 1 : 0);
        const features = extractFeatures(state, actorIndex);
        pendingRows.push({
          seed,
          phase: phaseName,
          round: state.round,
          actorIndex,
          actorCharacterId: actorMeta.characterId,
          actorAuroraDiceId: actorMeta.auroraDiceId || null,
          opponentCharacterId: opponentMeta.characterId,
          opponentAuroraDiceId: opponentMeta.auroraDiceId || null,
          legalActionCount: decision.count,
          selectedAction: {
            encodedAction: decision.action,
            opcode: getActionOpcode(decision.action),
            mask: getActionMask(decision.action),
            selectedBy: decision.selectedBy,
          },
          features,
          priority: scoreSamplePriority(state, features),
        });
      }

      applyActionInPlace(state, decision.action);
      steps += 1;
    }

    pendingRows.sort((a, b) => b.priority - a.priority);
    const pickedRows = pendingRows.slice(0, options.maxSamplesPerGame);

    for (let i = 0; i < pickedRows.length; i += 1) {
      const row = pickedRows[i];
      const result = buildResultRecord(state, row.actorIndex);
      row.result = {
        winnerIndex: result.winnerIndex,
        finalActorHp: result.finalActorHp,
        finalOpponentHp: result.finalOpponentHp,
        outcome: result.outcome,
        hpMargin: result.hpMargin,
      };
      row.targetValue = result.targetValue;
      delete row.priority;
      lines.push(JSON.stringify(row));
      totalRows += 1;
    }
  }

  fs.writeFileSync(options.out, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  return {
    ok: true,
    games: options.games,
    rows: totalRows,
    out: options.out,
    difficultyId: options.difficultyId,
  };
}

function main() {
  const result = generateSelfplayDataset(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_OUT_PATH,
  generateSelfplayDataset,
  parseArgs,
};
