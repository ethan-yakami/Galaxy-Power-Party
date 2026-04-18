const { CharacterRegistry, AuroraRegistry, listCustomVariants } = require('../../src/server/services/registry');
const { parseArgs, writeJson } = require('./cli_utils');

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateCharacters() {
  const issues = [];
  for (const character of Object.values(CharacterRegistry)) {
    if (!character || !character.id) continue;
    if (!Array.isArray(character.skills) || character.skills.length === 0) {
      issues.push({
        code: 'CHARACTER_SKILLS_MISSING',
        id: character.id,
      });
    }
    if (!Array.isArray(character.diceSides) || character.diceSides.length === 0) {
      issues.push({
        code: 'CHARACTER_DICE_INVALID',
        id: character.id,
      });
    }
  }
  return issues;
}

function validateAuroras() {
  const issues = [];
  for (const aurora of Object.values(AuroraRegistry)) {
    if (!aurora || !aurora.id) continue;
    if (!Array.isArray(aurora.faces) || aurora.faces.length === 0) {
      issues.push({
        code: 'AURORA_FACES_MISSING',
        id: aurora.id,
      });
    }
  }
  return issues;
}

function validateCustomVariants() {
  const issues = [];
  for (const variant of listCustomVariants()) {
    if (!variant || !variant.id) continue;
    if (!isPlainObject(variant.overrides)) {
      issues.push({
        code: 'CUSTOM_VARIANT_OVERRIDES_INVALID',
        id: variant.id,
      });
    }
  }
  return issues;
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const checks = [];
  if (!args.scope || args.scope === 'characters') {
    checks.push(...validateCharacters());
  }
  if (!args.scope || args.scope === 'auroras') {
    checks.push(...validateAuroras());
  }
  if (!args.scope || args.scope === 'custom') {
    checks.push(...validateCustomVariants());
  }

  return {
    exitCode: checks.length === 0 ? 0 : 4,
    payload: {
      ok: checks.length === 0,
      issues: checks,
      counts: {
        characters: Object.keys(CharacterRegistry).length,
        auroras: Object.keys(AuroraRegistry).length,
        customVariants: listCustomVariants().length,
      },
    },
  };
}

if (require.main === module) {
  const result = runCli();
  writeJson(result.payload);
  process.exit(result.exitCode);
}

module.exports = {
  runCli,
};
