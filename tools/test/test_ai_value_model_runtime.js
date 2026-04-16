const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createBattle } = require('../../src/core/battle-engine');
const {
  FEATURE_ORDER,
  extractFeatureVector,
  evaluateHeuristicState,
  evaluateState,
} = require('../../src/server/ai/evaluator');
const {
  loadValueModel,
  predictStateValue,
} = require('../../src/server/ai/model/runtime');

function buildDummyModel() {
  return {
    version: 2,
    modelType: 'mlp_tanh_v1',
    featureOrder: FEATURE_ORDER.slice(),
    normalization: {
      mean: FEATURE_ORDER.map(() => 0),
      std: FEATURE_ORDER.map(() => 1),
    },
    layers: [
      {
        weights: FEATURE_ORDER.map(() => Array(16).fill(0.01)),
        bias: Array(16).fill(0),
      },
      {
        weights: Array.from({ length: 16 }, () => [0.05]),
        bias: [0],
      },
    ],
  };
}

function main() {
  const state = createBattle({
    players: [
      { characterId: 'baie', auroraDiceId: 'legacy' },
      { characterId: 'daheita', auroraDiceId: 'destiny' },
    ],
  }, 'value-model-runtime', {
    startingAttacker: 0,
  });

  const vectorA = extractFeatureVector(state, 0);
  const vectorB = extractFeatureVector(state, 0);
  assert.strictEqual(vectorA.length, FEATURE_ORDER.length);
  assert.deepStrictEqual(vectorA, vectorB, 'feature vector order should be stable');

  const missingModel = loadValueModel({
    path: path.join(process.cwd(), 'tmp', 'missing-value-model.json'),
    forceReload: true,
  });
  assert.strictEqual(missingModel, null);

  const dummy = buildDummyModel();
  const prediction = predictStateValue(vectorA, dummy);
  assert.ok(Number.isFinite(prediction), 'dummy model prediction should be finite');

  const heuristic = evaluateHeuristicState(state, 0);
  const eliteBaseWithoutModel = evaluateState(state, 0, {
    difficultyId: 'elite',
    useValueModel: false,
  });
  const fallback = evaluateState(state, 0, {
    difficultyId: 'elite',
    modelPath: path.join(process.cwd(), 'tmp', 'missing-value-model.json'),
  });
  assert.ok(eliteBaseWithoutModel >= heuristic, 'elite base score should include weather-aware layers when present');
  assert.strictEqual(fallback, eliteBaseWithoutModel, 'missing model should fall back to elite base evaluation');

  const tmpModelPath = path.join(process.cwd(), 'tmp', 'ai', 'dummy-value-model.json');
  fs.mkdirSync(path.dirname(tmpModelPath), { recursive: true });
  fs.writeFileSync(tmpModelPath, JSON.stringify(dummy, null, 2), 'utf8');
  const loaded = loadValueModel({ path: tmpModelPath, forceReload: true });
  assert.ok(loaded, 'dummy model file should load');
  const blended = evaluateState(state, 0, {
    difficultyId: 'elite',
    modelPath: tmpModelPath,
  });
  assert.ok(Number.isFinite(blended), 'elite blended score should be finite');

  const legacyFallback = evaluateState(state, 0, {
    difficultyId: 'elite',
    model: Object.assign({}, dummy, { version: 1 }),
  });
  assert.strictEqual(legacyFallback, eliteBaseWithoutModel, 'legacy model version should fall back to elite base evaluation');
  console.log('ai value model runtime test passed');
}

main();
