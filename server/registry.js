/**
 * registry.js — Unified Entity Registry
 *
 * Automatically scans server/entities/characters/ and server/entities/auroras/
 * and builds two registries:
 *   - CharacterRegistry: { [id]: { stats, hooks } }
 *   - AuroraRegistry:    { [id]: { stats, hooks } }
 *
 * Each entity file exports a single plain object following the unified interface
 * (see server/entities/characters/_TEMPLATE.js for reference).
 *
 * Usage:
 *   const { CharacterRegistry, AuroraRegistry } = require('./registry');
 */

const path = require('path');
const fs   = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────

function loadDir(dir) {
  const registry = {};
  if (!fs.existsSync(dir)) return registry;

  const files = fs.readdirSync(dir).filter(
    (f) => f.endsWith('.js') && !f.startsWith('_')
  );

  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const entity = require(fullPath);
      if (!entity || !entity.id) {
        console.warn(`[Registry] Skipping ${file}: missing "id" field.`);
        continue;
      }
      if (registry[entity.id]) {
        // Allow override by later files (useful for versioned test variants)
        console.warn(`[Registry] Duplicate id "${entity.id}" in ${file} — overriding previous.`);
      }
      registry[entity.id] = entity;
    } catch (err) {
      console.error(`[Registry] Failed to load ${file}:`, err);
    }
  }
  return registry;
}

// ── load registries ───────────────────────────────────────────────────────────

const CHAR_DIR   = path.join(__dirname, 'entities', 'characters');
const AURORA_DIR = path.join(__dirname, 'entities', 'auroras');

const CharacterRegistry = loadDir(CHAR_DIR);
const AuroraRegistry    = loadDir(AURORA_DIR);

// ── summary helpers (used by client handshake / lobby) ────────────────────────

function countSides(sides) {
  const map = {};
  for (const s of sides) map[s] = (map[s] || 0) + 1;
  const keys = Object.keys(map).map(Number).sort((a, b) => b - a);
  return keys.map((k) => `${map[k]}x${k}`).join(' ');
}

function getCharacterSummary() {
  return Object.values(CharacterRegistry).map((c) => ({
    id:           c.id,
    name:         c.name,
    hp:           c.hp,
    diceSides:    c.diceSides,
    auroraUses:   c.auroraUses,
    attackLevel:  c.attackLevel,
    defenseLevel: c.defenseLevel,
    shortSpec:    `${countSides(c.diceSides)} ${c.auroraUses}A ${c.attackLevel}+${c.defenseLevel}`,
    skillText:    c.skillText,
  }));
}

function getAuroraDiceSummary() {
  return Object.values(AuroraRegistry).map((a) => ({
    id:            a.id,
    name:          a.name,
    facesText:     a.faces.map((f) => (f.hasA ? `${f.value}A` : `${f.value}`)).join(' '),
    effectText:    a.effectText,
    conditionText: a.conditionText,
  }));
}

// ── hook dispatch helpers (direct replacement for CharacterHooks / AuroraHooks) ─

/**
 * Trigger a named hook on a character entity.
 * @param {string} hookName  e.g. 'onAttackConfirm'
 * @param {object} player    must have .characterId
 * @param {...any} args      forwarded to hook function
 */
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

/**
 * Get AI scoring bonus for an attack combo from a character's hooks.
 */
function characterAiScoreAttack(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return 0;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiScoreAttackCombo === 'function') {
    return hooks.aiScoreAttackCombo(dice, indices, game, playerId);
  }
  return 0;
}

/**
 * Get AI scoring bonus for a defense combo from a character's hooks.
 */
function characterAiScoreDefense(characterId, dice, indices, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return 0;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiScoreDefenseCombo === 'function') {
    return hooks.aiScoreDefenseCombo(dice, indices, game, playerId);
  }
  return 0;
}

/**
 * Get AI reroll filter from a character's hooks.
 */
function characterAiFilterReroll(characterId, dice, game, playerId) {
  const entity = CharacterRegistry[characterId];
  if (!entity) return null;
  const hooks = entity.hooks;
  if (hooks && typeof hooks.aiFilterReroll === 'function') {
    return hooks.aiFilterReroll(dice, game, playerId);
  }
  return null;
}

// ── aurora hook dispatch ──────────────────────────────────────────────────────

/**
 * Check if an aurora die can be used right now.
 * @returns {{ ok: boolean, reason: string }}
 */
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

/**
 * Trigger the A-effect of an aurora die on attack.
 */
function triggerAuroraOnAttack(game, attacker, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (entity && entity.hooks && typeof entity.hooks.onAttack === 'function') {
    entity.hooks.onAttack(game, attacker, auroraDie, room);
  }
}

/**
 * Trigger the A-effect of an aurora die on defense.
 */
function triggerAuroraOnDefense(game, defender, auroraDie, room) {
  if (!auroraDie || !auroraDie.hasA) return;
  const entity = AuroraRegistry[auroraDie.auroraId];
  if (entity && entity.hooks && typeof entity.hooks.onDefense === 'function') {
    entity.hooks.onDefense(game, defender, auroraDie, room);
  }
}

// ── exports ───────────────────────────────────────────────────────────────────

module.exports = {
  CharacterRegistry,
  AuroraRegistry,
  countSides,
  getCharacterSummary,
  getAuroraDiceSummary,
  // character hook dispatch
  triggerCharacterHook,
  characterAiScoreAttack,
  characterAiScoreDefense,
  characterAiFilterReroll,
  // aurora hook dispatch
  canUseAurora,
  triggerAuroraOnAttack,
  triggerAuroraOnDefense,
};
