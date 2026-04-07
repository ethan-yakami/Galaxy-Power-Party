const path = require('path');
const fs = require('fs');

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
      if (registry[entity.id]) {
        console.warn(`[Registry] Duplicate id "${entity.id}" in ${file}; overriding previous.`);
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
    maxAttackRerolls,
    baseCharacterId,
    isCustomVariant,
  });
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

  const enabled = variant.enabled !== false;
  if (!enabled) return null;

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
    const raw = baseCharacters[id];
    const normalized = normalizeCharacterEntity(raw, `character "${id}"`, {
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

function countSides(sides) {
  const map = {};
  for (const s of sides) map[s] = (map[s] || 0) + 1;
  const keys = Object.keys(map).map(Number).sort((a, b) => b - a);
  return keys.map((k) => `${map[k]}x${k}`).join(' ');
}

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
  if (!entity) return null;
  const hooks = entity.hooks;
  if (hooks && typeof hooks[hookName] === 'function') {
    return hooks[hookName](...args);
  }
  return null;
}

function characterShouldAscend(player, game) {
  if (!player || !player.characterId) return false;
  const entity = CharacterRegistry[player.characterId];
  if (!entity || !entity.hooks) return false;
  if (typeof entity.hooks.shouldAscend !== 'function') return false;

  try {
    return !!entity.hooks.shouldAscend(game, player);
  } catch (err) {
    console.error(`[Registry] character shouldAscend hook failed for "${player.characterId}":`, err);
    return false;
  }
}

function characterAiScoreAttack(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return 0;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiScoreAttackCombo === 'function') {
    return hooks.aiScoreAttackCombo(dice, indices, game, playerId);
  }
  return 0;
}

function characterAiScoreDefense(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return 0;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiScoreDefenseCombo === 'function') {
    return hooks.aiScoreDefenseCombo(dice, indices, game, playerId);
  }
  return 0;
}

function characterAiFilterReroll(characterId, dice, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return null;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiFilterReroll === 'function') {
    return hooks.aiFilterReroll(dice, game, playerId);
  }
  return null;
}

function canUseAurora(player, game, role) {
  const auroraId = player.auroraDiceId;
  if (!auroraId) return { ok: false, reason: '你尚未装备曜彩骰。' };

  const usesLeft = game.auroraUsesRemaining[player.id] || 0;
  if (usesLeft <= 0) return { ok: false, reason: '曜彩骰使用次数已耗尽。' };
  if (game.roundAuroraUsed[player.id]) return { ok: false, reason: '本轮你已使用过曜彩骰。' };

  const entity = AuroraRegistry[auroraId];
  if (entity && entity.hooks && typeof entity.hooks.canUse === 'function') {
    const check = entity.hooks.canUse(player, game, role);
    if (check && !check.ok) return check;
  }
  return { ok: true, reason: '' };
}

function triggerAuroraOnAttack(game, attacker, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (entity && entity.hooks && typeof entity.hooks.onAttack === 'function') {
    entity.hooks.onAttack(game, attacker, auroraDie, room);
  }
}

function triggerAuroraOnDefense(game, defender, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (entity && entity.hooks && typeof entity.hooks.onDefense === 'function') {
    entity.hooks.onDefense(game, defender, auroraDie, room);
  }
}

let CharacterRegistry = buildCharacterRegistry();
const AuroraRegistry = loadDir(AURORA_DIR);

function reloadRegistry() {
  const nextRegistry = buildCharacterRegistry();
  for (const id of Object.keys(CharacterRegistry)) {
    delete CharacterRegistry[id];
  }
  Object.assign(CharacterRegistry, nextRegistry);
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

module.exports = {
  reloadRegistry,
  saveCustomVariant,
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
};
