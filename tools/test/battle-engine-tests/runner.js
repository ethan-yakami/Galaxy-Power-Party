const { CHARACTER_RULES } = require('../../../src/core/battle-engine/rules/characters');
const { AURORA_RULES } = require('../../../src/core/battle-engine/rules/auroras');

const generalRulesCases = require('./general_rules');
const mechanicsMatrixCases = require('./mechanics_matrix');
const replayConsistencyCases = require('./replay_consistency');

const GROUPS = [
  { name: 'general_rules', cases: generalRulesCases },
  { name: 'mechanics_matrix', cases: mechanicsMatrixCases },
  { name: 'replay_consistency', cases: replayConsistencyCases },
];

const REQUIRED_MECHANISMS = [
  'pierce',
  'double_strike',
  'overload',
  'destiny',
  'counter',
  'unyielding',
  'hack',
  'weather',
];

function flattenCases() {
  return GROUPS.flatMap((group) => group.cases.map((testCase) => ({ ...testCase, group: group.name })));
}

function validateCaseShape(testCase) {
  const missing = [];
  if (!testCase.id || typeof testCase.id !== 'string') missing.push('id');
  if (!testCase.title || typeof testCase.title !== 'string') missing.push('title');
  if (!Array.isArray(testCase.tags)) missing.push('tags');
  if (!testCase.arrange || typeof testCase.arrange !== 'string') missing.push('arrange');
  if (!testCase.act || typeof testCase.act !== 'string') missing.push('act');
  if (!testCase.assert || typeof testCase.assert !== 'string') missing.push('assert');
  if (typeof testCase.run !== 'function') missing.push('run');
  if (missing.length) {
    throw new Error(`Invalid case shape for ${testCase.id || '<unknown>'}: missing ${missing.join(', ')}`);
  }
}

function ensureCoverageGates(cases) {
  const tags = new Set();
  for (const testCase of cases) {
    for (const tag of testCase.tags) {
      tags.add(tag);
    }
  }

  const missingMechanisms = REQUIRED_MECHANISMS
    .map((name) => `mechanism:${name}`)
    .filter((tag) => !tags.has(tag));
  if (missingMechanisms.length) {
    throw new Error(`Missing core mechanism coverage tags: ${missingMechanisms.join(', ')}`);
  }

  const missingCharacters = Object.keys(CHARACTER_RULES)
    .sort()
    .map((id) => `character:${id}`)
    .filter((tag) => !tags.has(tag));
  if (missingCharacters.length) {
    throw new Error(`Missing character smoke coverage tags: ${missingCharacters.join(', ')}`);
  }

  const missingAuroras = Object.keys(AURORA_RULES)
    .sort()
    .map((id) => `aurora:${id}`)
    .filter((tag) => !tags.has(tag));
  if (missingAuroras.length) {
    throw new Error(`Missing aurora smoke coverage tags: ${missingAuroras.join(', ')}`);
  }
}

function runCase(testCase) {
  validateCaseShape(testCase);
  testCase.run();
}

function runAll() {
  const cases = flattenCases();
  ensureCoverageGates(cases);

  let passed = 0;
  const failures = [];

  for (const group of GROUPS) {
    console.log(`\n[Group] ${group.name} (${group.cases.length} cases)`);
    for (const testCase of group.cases) {
      try {
        runCase(testCase);
        passed += 1;
        console.log(`  PASS ${testCase.id} - ${testCase.title}`);
      } catch (error) {
        failures.push({ caseId: testCase.id, group: group.name, error });
        console.error(`  FAIL ${testCase.id} - ${testCase.title}`);
        console.error(`       ${error && error.stack ? error.stack : String(error)}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`\n[Summary] ${passed}/${cases.length} passed, ${failures.length} failed.`);
    const failedIds = failures.map((item) => `${item.group}:${item.caseId}`).join(', ');
    throw new Error(`Battle-engine matrix failed: ${failedIds}`);
  }

  console.log(`\n[Summary] ${passed}/${cases.length} passed.`);
  console.log('battle-engine tests passed');
}

module.exports = {
  runAll,
};


