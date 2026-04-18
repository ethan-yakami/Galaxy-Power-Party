const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generateSelfplayDataset } = require('../ai/generate_selfplay_dataset');

function main() {
  const outPath = path.join(process.cwd(), 'tmp', 'ai', 'test-selfplay-dataset.jsonl');
  const result = generateSelfplayDataset({
    games: 4,
    maxSamplesPerGame: 4,
    out: outPath,
  });

  assert.strictEqual(result.ok, true);
  assert.ok(fs.existsSync(outPath), 'dataset file should be created');
  const lines = fs.readFileSync(outPath, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length > 0, 'dataset file should contain rows');
  const row = JSON.parse(lines[0]);
  assert.ok(row.phase === 'attack_reroll_or_select' || row.phase === 'defense_select');
  assert.ok(Number.isFinite(row.targetValue), 'targetValue should be finite');
  assert.ok(row.selectedAction && Number.isInteger(row.selectedAction.encodedAction), 'selectedAction should be recorded');
  assert.ok(row.features && Number.isFinite(row.features.currentWeatherId), 'dataset row should include weather-aware features');
  console.log('ai dataset pipeline test passed');
}

main();
