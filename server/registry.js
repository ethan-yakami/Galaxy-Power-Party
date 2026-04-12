const path = require('path');
const fs = require('fs');
const SkillRegistry = require('./skillRegistry');

const CHAR_DIR = path.join(__dirname, 'entities', 'characters');
const AURORA_DIR = path.join(__dirname, 'entities', 'auroras');
const CUSTOM_CHAR_PATH = process.env.GPP_CUSTOM_CHARACTER_PATH
  ? path.resolve(process.env.GPP_CUSTOM_CHARACTER_PATH)
  : path.join(__dirname, 'entities', 'custom_characters.json');

const ALLOWED_VARIANT_OVERRIDE_KEYS = new Set([
  'hp',
  'diceSides',
  'auroraUses',
  'attackLevel',
  'defenseLevel',
  'maxAttackRerolls',
]);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function normalizeSkillRefs(raw) {
  if (!Array.isArray(raw)) return [];
  const refs = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      refs.push({ skillId: item.trim(), params: {} });
      continue;
    }
    if (!isPlainObject(item)) continue;
    const skillId = typeof item.skillId === 'string' ? item.skillId.trim() : '';
    if (!skillId) continue;
    refs.push({
      skillId,
      params: isPlainObject(item.params) ? item.params : {},
    });
  }
  return refs;
}

function buildLegacyCharacterSkill(id, hooks) {
  const skillId = `character:${id}:legacy`;
  const handlers = {};
  for (const [hookName, fn] of Object.entries(hooks || {})) {
    if (typeof fn !== 'function') continue;
    handlers[hookName] = ({ args = [] }) => fn(...args);
  }
  SkillRegistry.register(skillId, handlers, { kind: 'character', ownerId: id, legacy: true });
  return { skillId, params: {} };
}

function buildLegacyAuroraSkill(id, hooks) {
  const skillId = `aurora:${id}:legacy`;
  const handlers = {};
  if (typeof hooks.canUse === 'function') {
    handlers.canUse = ({ player, game, role }) => hooks.canUse(player, game, role);
  }
  if (typeof hooks.onAttack === 'function') {
    handlers.onAttack = ({ game, player, auroraDie, room }) => hooks.onAttack(game, player, auroraDie, room);
  }
  if (typeof hooks.onDefense === 'function') {
    handlers.onDefense = ({ game, player, auroraDie, room }) => hooks.onDefense(game, player, auroraDie, room);
  }
  SkillRegistry.register(skillId, handlers, { kind: 'aurora', ownerId: id, legacy: true });
  return { skillId, params: {} };
}

function loadDir(dir) {
  const registry = {};
  if (!fs.existsSync(dir)) return registry;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  files.sort();

  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const entity = require(fullPath);
      if (!entity || !entity.id) {
        console.warn(`[Registry] Skipping ${file}: missing "id" field.`);
        continue;
      }
      registry[entity.id] = entity;
    } catch (err) {
      console.error(`[Registry] Failed to load ${file}:`, err);
    }
  }

  return registry;
}

function normalizeCharacterEntity(entity, sourceTag, options = {}) {
  if (!isPlainObject(entity)) {
    console.warn(`[Registry] Skipping ${sourceTag}: entity is not an object.`);
    return null;
  }

  const id = typeof entity.id === 'string' ? entity.id.trim() : '';
  if (!id) {
    console.warn(`[Registry] Skipping ${sourceTag}: missing/invalid "id".`);
    return null;
  }

  const name = typeof entity.name === 'string' ? entity.name.trim() : '';
  if (!name) {
    console.warn(`[Registry] Skipping ${sourceTag}: missing/invalid "name".`);
    return null;
  }

  if (!isPositiveInt(entity.hp)) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "hp".`);
    return null;
  }

  if (!Array.isArray(entity.diceSides) || entity.diceSides.length === 0) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "diceSides".`);
    return null;
  }
  for (const side of entity.diceSides) {
    if (!isPositiveInt(side) || side < 2) {
      console.warn(`[Registry] Skipping ${sourceTag}: invalid die side "${side}".`);
      return null;
    }
  }

  if (!isNonNegativeInt(entity.auroraUses)) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "auroraUses".`);
    return null;
  }

  if (!isPositiveInt(entity.attackLevel)) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "attackLevel".`);
    return null;
  }

  if (!isPositiveInt(entity.defenseLevel)) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "defenseLevel".`);
    return null;
  }

  const skillText = typeof entity.skillText === 'string' ? entity.skillText : '';
  const hooks = isPlainObject(entity.hooks) ? entity.hooks : {};

  const rerollsRaw = entity.maxAttackRerolls;
  const maxAttackRerolls = rerollsRaw === undefined ? 2 : rerollsRaw;
  if (!isNonNegativeInt(maxAttackRerolls)) {
    console.warn(`[Registry] Skipping ${sourceTag}: invalid "maxAttackRerolls".`);
    return null;
  }

  const explicitSkillRefs = normalizeSkillRefs(entity.skills);
  const legacyRef = buildLegacyCharacterSkill(id, hooks);
  const skills = explicitSkillRefs.length ? explicitSkillRefs : [legacyRef];

  const baseCharacterId = options.baseCharacterId || id;
  const isCustomVariant = !!options.isCustomVariant;

  return Object.assign({}, entity, {
    id,
    name,
    hp: entity.hp,
    diceSides: entity.diceSides.slice(),
    auroraUses: entity.auroraUses,
    attackLevel: entity.attackLevel,
    defenseLevel: entity.defenseLevel,
    skillText,
    hooks,
    skills,
    maxAttackRerolls,
    baseCharacterId,
    isCustomVariant,
  });
}

function normalizeAuroraEntity(entity, sourceTag) {
  if (!isPlainObject(entity)) return null;
  const id = typeof entity.id === 'string' ? entity.id.trim() : '';
  if (!id) return null;
  const hooks = isPlainObject(entity.hooks) ? entity.hooks : {};
  const explicitSkillRefs = normalizeSkillRefs(entity.skills);
  const legacyRef = buildLegacyAuroraSkill(id, hooks);
  const skills = explicitSkillRefs.length ? explicitSkillRefs : [legacyRef];
  return Object.assign({}, entity, { id, hooks, skills });
}

function loadCustomCharacterVariants() {
  if (!fs.existsSync(CUSTOM_CHAR_PATH)) return [];
  try {
    const raw = fs.readFileSync(CUSTOM_CHAR_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      console.warn('[Registry] custom_characters.json ignored: root must be an object.');
      return [];
    }
    if (!Array.isArray(parsed.variants)) {
      console.warn('[Registry] custom_characters.json ignored: "variants" must be an array.');
      return [];
    }
    return parsed.variants;
  } catch (err) {
    console.error('[Registry] Failed to load custom_characters.json:', err.message || err);
    return [];
  }
}

function buildVariantCharacter(variant, characterRegistry) {
  if (!isPlainObject(variant)) {
    console.warn('[Registry] Skipping custom variant: entry must be an object.');
    return null;
  }

  if (variant.enabled === false) return null;

  const id = typeof variant.id === 'string' ? variant.id.trim() : '';
  if (!id) {
    console.warn('[Registry] Skipping custom variant: missing/invalid "id".');
    return null;
  }
  if (characterRegistry[id]) {
    console.warn(`[Registry] Skipping custom variant "${id}": id already exists.`);
    return null;
  }

  const baseCharacterId = typeof variant.baseCharacterId === 'string' ? variant.baseCharacterId.trim() : '';
  if (!baseCharacterId) {
    console.warn(`[Registry] Skipping custom variant "${id}": missing/invalid "baseCharacterId".`);
    return null;
  }

  const base = characterRegistry[baseCharacterId];
  if (!base) {
    console.warn(`[Registry] Skipping custom variant "${id}": base "${baseCharacterId}" not found.`);
    return null;
  }

  const overrides = variant.overrides;
  if (!isPlainObject(overrides)) {
    console.warn(`[Registry] Skipping custom variant "${id}": missing/invalid "overrides".`);
    return null;
  }
  for (const key of Object.keys(overrides)) {
    if (!ALLOWED_VARIANT_OVERRIDE_KEYS.has(key)) {
      console.warn(`[Registry] Skipping custom variant "${id}": override key "${key}" is not allowed.`);
      return null;
    }
  }

  const name = typeof variant.name === 'string' && variant.name.trim() ? variant.name.trim() : base.name;
  const merged = Object.assign({}, base, overrides, {
    id,
    name,
    hooks: base.hooks,
    skills: base.skills,
    skillText: base.skillText,
  });

  return normalizeCharacterEntity(merged, `custom variant "${id}"`, {
    baseCharacterId: base.baseCharacterId || base.id,
    isCustomVariant: true,
  });
}

function buildCharacterRegistry() {
  const registry = {};
  const baseCharacters = loadDir(CHAR_DIR);
  const baseIds = Object.keys(baseCharacters).sort();

  for (const id of baseIds) {
    const normalized = normalizeCharacterEntity(baseCharacters[id], `character "${id}"`, {
      baseCharacterId: id,
      isCustomVariant: false,
    });
    if (!normalized) continue;
    registry[normalized.id] = normalized;
  }

  const variants = loadCustomCharacterVariants();
  for (const variant of variants) {
    const normalized = buildVariantCharacter(variant, registry);
    if (!normalized) continue;
    registry[normalized.id] = normalized;
  }

  return registry;
}

function buildAuroraRegistry() {
  const registry = {};
  const raw = loadDir(AURORA_DIR);
  for (const id of Object.keys(raw)) {
    const normalized = normalizeAuroraEntity(raw[id], `aurora "${id}"`);
    if (!normalized) continue;
    registry[normalized.id] = normalized;
  }
  return registry;
}

function countSides(sides) {
  const map = {};
  for (const s of sides) map[s] = (map[s] || 0) + 1;
  const keys = Object.keys(map).map(Number).sort((a, b) => b - a);
  return keys.map((k) => `${map[k]}x${k}`).join(' ');
}

const CharacterRegistry = {};
const AuroraRegistry = {};
let registryRevision = 0;

function reloadRegistry() {
  SkillRegistry.clear();
  const nextCharacters = buildCharacterRegistry();
  const nextAuroras = buildAuroraRegistry();

  for (const id of Object.keys(CharacterRegistry)) delete CharacterRegistry[id];
  for (const id of Object.keys(AuroraRegistry)) delete AuroraRegistry[id];

  Object.assign(CharacterRegistry, nextCharacters);
  Object.assign(AuroraRegistry, nextAuroras);
  registryRevision += 1;
}

reloadRegistry();

function getCharacterSummary() {
  return Object.values(CharacterRegistry).map((c) => ({
    id: c.id,
    name: c.name,
    hp: c.hp,
    diceSides: c.diceSides,
    auroraUses: c.auroraUses,
    attackLevel: c.attackLevel,
    defenseLevel: c.defenseLevel,
    shortSpec: `${countSides(c.diceSides)} ${c.auroraUses}A ${c.attackLevel}+${c.defenseLevel}`,
    skillText: c.skillText,
    baseCharacterId: c.baseCharacterId,
    isCustomVariant: c.isCustomVariant,
    maxAttackRerolls: c.maxAttackRerolls,
  }));
}

function getAuroraDiceSummary() {
  return Object.values(AuroraRegistry).map((a) => ({
    id: a.id,
    name: a.name,
    facesText: a.faces.map((f) => (f.hasA ? `${f.value}A` : `${f.value}`)).join(' '),
    effectText: a.effectText,
    conditionText: a.conditionText,
  }));
}

function triggerCharacterHook(hookName, player, ...args) {
  if (!player || !player.characterId) return null;
  const entity = CharacterRegistry[player.characterId];
  if (!entity || !Array.isArray(entity.skills)) return null;
  return SkillRegistry.runMany(entity.skills, hookName, {
    kind: 'character',
    ownerId: entity.id,
    player,
    args,
    game: args[0] || null,
  });
}

function characterShouldAscend(player, game) {
  const result = triggerCharacterHook('shouldAscend', player, game, player);
  return !!result;
}

function characterAiScoreAttack(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity || !Array.isArray(entity.skills)) return 0;
  const result = SkillRegistry.runMany(entity.skills, 'aiScoreAttackCombo', {
    kind: 'character',
    ownerId: entity.id,
    args: [dice, indices, game, playerId],
    game,
    playerId,
  });
  return typeof result === 'number' ? result : 0;
}

function characterAiScoreDefense(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity || !Array.isArray(entity.skills)) return 0;
  const result = SkillRegistry.runMany(entity.skills, 'aiScoreDefenseCombo', {
    kind: 'character',
    ownerId: entity.id,
    args: [dice, indices, game, playerId],
    game,
    playerId,
  });
  return typeof result === 'number' ? result : 0;
}

function characterAiFilterReroll(characterId, dice, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity || !Array.isArray(entity.skills)) return null;
  const result = SkillRegistry.runMany(entity.skills, 'aiFilterReroll', {
    kind: 'character',
    ownerId: entity.id,
    args: [dice, game, playerId],
    game,
    playerId,
  });
  return Array.isArray(result) ? result : null;
}

function canUseAurora(player, game, role) {
  const auroraId = player.auroraDiceId;
  if (!auroraId) return { ok: false, reason: '你尚未装备曜彩骰。' };

  const usesLeft = game.auroraUsesRemaining[player.id] || 0;
  if (usesLeft <= 0) return { ok: false, reason: '曜彩骰使用次数已耗尽。' };
  if (game.roundAuroraUsed[player.id]) return { ok: false, reason: '本轮你已使用过曜彩骰。' };

  const entity = AuroraRegistry[auroraId];
  if (!entity || !Array.isArray(entity.skills)) return { ok: true, reason: '' };

  const check = SkillRegistry.runMany(entity.skills, 'canUse', {
    kind: 'aurora',
    ownerId: entity.id,
    player,
    game,
    role,
    args: [player, game, role],
  });
  if (check && check.ok === false) return check;
  return { ok: true, reason: '' };
}

function triggerAuroraOnAttack(game, attacker, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (!entity || !Array.isArray(entity.skills)) return;
  SkillRegistry.runMany(entity.skills, 'onAttack', {
    kind: 'aurora',
    ownerId: entity.id,
    game,
    player: attacker,
    auroraDie,
    room,
    args: [game, attacker, auroraDie, room],
  });
}

function triggerAuroraOnDefense(game, defender, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (!entity || !Array.isArray(entity.skills)) return;
  SkillRegistry.runMany(entity.skills, 'onDefense', {
    kind: 'aurora',
    ownerId: entity.id,
    game,
    player: defender,
    auroraDie,
    room,
    args: [game, defender, auroraDie, room],
  });
}

function saveCustomVariant(variant) {
  const filePath = path.resolve(CUSTOM_CHAR_PATH);
  let data = { variants: [] };

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error('custom_characters.json root must be an object.');
    }
    data = parsed;
  }

  if (!Array.isArray(data.variants)) data.variants = [];
  data.variants.push(variant);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  reloadRegistry();
}

function getRegistryRevision() {
  return registryRevision;
}

module.exports = {
  reloadRegistry,
  saveCustomVariant,
  getRegistryRevision,
  CharacterRegistry,
  AuroraRegistry,
  countSides,
  getCharacterSummary,
  getAuroraDiceSummary,
  triggerCharacterHook,
  characterShouldAscend,
  characterAiScoreAttack,
  characterAiScoreDefense,
  characterAiFilterReroll,
  canUseAurora,
  triggerAuroraOnAttack,
  triggerAuroraOnDefense,
  SkillRegistry,
};
