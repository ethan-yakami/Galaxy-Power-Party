const { CharacterRegistry, AuroraRegistry, getRegistryRevision } = require('../../registry');
const { WEATHER_DEFS, WEATHER_POOLS } = require('../../weather');
const { MASKS_BY_ROLL_AND_COUNT, INDICES_BY_MASK } = require('../actions');
const { CHARACTER_RULES } = require('../rules/characters');
const { AURORA_RULES } = require('../rules/auroras');

let cachedCatalog = null;
let cachedRevision = -1;

function sortedValues(input) {
  return Object.keys(input).sort().map((key) => input[key]);
}

function countDistinct(values, count) {
  const set = new Set();
  for (let i = 0; i < count; i += 1) set.add(values[i]);
  return set.size;
}

function compileCharacters() {
  const characters = [];
  const characterIndexById = Object.create(null);
  const baseCharacterPool = [];
  const raw = sortedValues(CharacterRegistry);

  for (let i = 0; i < raw.length; i += 1) {
    const entity = raw[i];
    const behaviorKey = entity.baseCharacterId || entity.id;
    const compiled = {
      id: entity.id,
      name: entity.name,
      hp: entity.hp,
      diceSides: Int16Array.from(entity.diceSides),
      auroraUses: entity.auroraUses,
      attackLevel: entity.attackLevel,
      defenseLevel: entity.defenseLevel,
      maxAttackRerolls: entity.maxAttackRerolls == null ? 2 : entity.maxAttackRerolls,
      skillText: entity.skillText || '',
      baseCharacterId: behaviorKey,
      behaviorKey,
      isCustomVariant: !!entity.isCustomVariant,
      behavior: CHARACTER_RULES[behaviorKey] || null,
    };
    characterIndexById[compiled.id] = characters.length;
    if (!compiled.isCustomVariant) baseCharacterPool.push(characters.length);
    characters.push(compiled);
  }

  return {
    characters,
    characterIndexById,
    baseCharacterPool,
  };
}

function compileAuroras() {
  const auroras = [];
  const auroraIndexById = Object.create(null);
  const raw = sortedValues(AuroraRegistry);

  for (let i = 0; i < raw.length; i += 1) {
    const entity = raw[i];
    const faceCount = entity.faces.length;
    const facesValues = new Int16Array(faceCount);
    const facesHasA = new Uint8Array(faceCount);
    let maxValue = 0;
    for (let j = 0; j < faceCount; j += 1) {
      facesValues[j] = entity.faces[j].value;
      facesHasA[j] = entity.faces[j].hasA ? 1 : 0;
      if (entity.faces[j].value > maxValue) maxValue = entity.faces[j].value;
    }

    const compiled = {
      id: entity.id,
      name: entity.name,
      effectText: entity.effectText || '',
      conditionText: entity.conditionText || '',
      faceCount,
      facesValues,
      facesHasA,
      maxValue,
      distinctValueCount: countDistinct(facesValues, faceCount),
      behavior: AURORA_RULES[entity.id] || null,
    };

    auroraIndexById[compiled.id] = auroras.length;
    auroras.push(compiled);
  }

  return {
    auroras,
    auroraIndexById,
  };
}

function compileWeather() {
  const weatherIds = Object.keys(WEATHER_DEFS).sort();
  const weatherDefs = [];
  const weatherIndexById = Object.create(null);

  for (let i = 0; i < weatherIds.length; i += 1) {
    const id = weatherIds[i];
    const raw = WEATHER_DEFS[id];
    weatherIndexById[id] = i;
    weatherDefs.push({
      id,
      name: raw.name,
      type: raw.type,
    });
  }

  const weatherPoolsByStage = {
    2: [],
    4: [],
    6: [],
    8: [],
  };

  for (const key of Object.keys(WEATHER_POOLS)) {
    const stage = Number(key);
    weatherPoolsByStage[stage] = WEATHER_POOLS[key]
      .map((id) => weatherIndexById[id])
      .filter((value) => value != null);
  }

  return {
    weatherIds,
    weatherDefs,
    weatherIndexById,
    weatherPoolsByStage,
  };
}

function compileCatalog() {
  const revision = getRegistryRevision();
  if (cachedCatalog && cachedRevision === revision) return cachedCatalog;

  cachedCatalog = {
    revision,
    ...compileCharacters(),
    ...compileAuroras(),
    ...compileWeather(),
    maskTableByRollAndCount: MASKS_BY_ROLL_AND_COUNT,
    indicesByMask: INDICES_BY_MASK,
  };
  cachedRevision = revision;
  return cachedCatalog;
}

function invalidateCompiledCatalog() {
  cachedCatalog = null;
  cachedRevision = -1;
}

module.exports = {
  compileCatalog,
  invalidateCompiledCatalog,
};
