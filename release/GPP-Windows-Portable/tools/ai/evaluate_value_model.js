const fs = require('fs');
const path = require('path');

const { loadValueModel, predictStateValue } = require('../../src/server/ai/model/runtime');

const DEFAULT_DATASET = path.join(process.cwd(), 'tmp', 'ai', 'selfplay_dataset.jsonl');

function parseArgs(argv) {
  const options = {
    dataset: DEFAULT_DATASET,
    modelPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--dataset' && next) {
      options.dataset = path.resolve(next);
      i += 1;
    } else if (arg === '--model' && next) {
      options.modelPath = path.resolve(next);
      i += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const model = loadValueModel({ path: options.modelPath });
  if (!model) {
    console.error('value model missing or invalid');
    process.exit(1);
  }
  if (!fs.existsSync(options.dataset)) {
    console.error(`dataset not found: ${options.dataset}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(options.dataset, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    console.error('dataset is empty');
    process.exit(1);
  }

  let total = 0;
  let sumSquared = 0;
  let sumAbs = 0;
  let minPred = Infinity;
  let maxPred = -Infinity;

  for (let i = 0; i < lines.length; i += 1) {
    const row = JSON.parse(lines[i]);
    const features = row.features || {};
    const vector = model.featureOrder.map((name) => Number.isFinite(features[name]) ? features[name] : 0);
    const prediction = predictStateValue(vector, model);
    if (!Number.isFinite(prediction)) {
      console.error(`non-finite prediction at row ${i}`);
      process.exit(1);
    }
    const target = Number(row.targetValue || 0);
    const diff = prediction - target;
    sumSquared += diff * diff;
    sumAbs += Math.abs(diff);
    minPred = Math.min(minPred, prediction);
    maxPred = Math.max(maxPred, prediction);
    total += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    rows: total,
    mse: sumSquared / total,
    mae: sumAbs / total,
    minPrediction: minPred,
    maxPrediction: maxPred,
  }));
}

main();
