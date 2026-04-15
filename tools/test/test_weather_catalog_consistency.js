const assert = require('assert');

const {
  STAGE_ROUNDS,
  WEATHER_POOLS,
  WEATHER_DEFS,
} = require('../../src/content/entities/weather');
const { compileCatalog } = require('../../src/core/battle-engine/catalog/compiler');
const { getWeatherCatalogSummary } = require('../../src/server/services/weather');

function normalizePoolMap(poolMap) {
  const out = {};
  for (const stage of STAGE_ROUNDS) {
    out[stage] = Array.isArray(poolMap[stage]) ? poolMap[stage].slice() : [];
  }
  return out;
}

function normalizeServerPools(summary) {
  const out = {};
  const source = (summary && summary.poolsByStage) || {};
  for (const stage of STAGE_ROUNDS) {
    const rows = Array.isArray(source[stage]) ? source[stage] : [];
    out[stage] = rows.map((row) => row.id);
  }
  return out;
}

function normalizeEnginePools(catalog) {
  const out = {};
  const weatherIds = catalog.weatherIds || [];
  const pools = catalog.weatherPoolsByStage || {};
  for (const stage of STAGE_ROUNDS) {
    const indices = Array.isArray(pools[stage]) ? pools[stage] : [];
    out[stage] = indices.map((idx) => weatherIds[idx]).filter(Boolean);
  }
  return out;
}

function run() {
  const summary = getWeatherCatalogSummary();
  const catalog = compileCatalog();

  const contentWeatherIds = Object.keys(WEATHER_DEFS).sort();
  const serverWeatherIds = (summary.weathers || []).map((item) => item.id).sort();
  const engineWeatherIds = (catalog.weatherIds || []).slice().sort();

  assert.deepStrictEqual(serverWeatherIds, contentWeatherIds, 'server weather ids must match content weather ids');
  assert.deepStrictEqual(engineWeatherIds, contentWeatherIds, 'engine weather ids must match content weather ids');
  assert.deepStrictEqual(summary.stageRounds, STAGE_ROUNDS, 'server stage rounds must match content stage rounds');

  const expectedPools = normalizePoolMap(WEATHER_POOLS);
  const serverPools = normalizeServerPools(summary);
  const enginePools = normalizeEnginePools(catalog);
  assert.deepStrictEqual(serverPools, expectedPools, 'server weather pools must match content weather pools');
  assert.deepStrictEqual(enginePools, expectedPools, 'engine weather pools must match content weather pools');

  console.log('test_weather_catalog_consistency passed');
}

run();

