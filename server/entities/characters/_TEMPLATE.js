/**
 * _TEMPLATE.js — Character Entity Template (DO NOT LOAD — prefixed with _)
 *
 * Copy this file to a new name (e.g. my_char.js) and fill in your values.
 * The registry auto-loads every .js file in this directory that does NOT
 * start with an underscore (_).
 *
 * HOOKS reference:
 *
 *   onAttackConfirm(game, attacker, selectedDice, room)
 *     Called after attacker selects dice, before attackValue is computed.
 *     Use to set game flags (e.g. pierce, extra attack) or modify dice.
 *
 *   onMainAttackConfirm(game, attacker, selectedDice, room)
 *     Called after attackValue is computed.
 *     Use to add bonuses to game.attackValue, trigger instant damage, etc.
 *
 *   onDefenseRoll(game, defender)
 *     Called when defender rolls dice, before dice are generated.
 *     Use to modify defenseLevel for this roll.
 *
 *   onDefenseConfirm(game, defender, selectedDice, room)
 *     Called after defender selects dice, before defenseValue is computed.
 *
 *   onMainDefenseConfirm(game, defender, selectedDice, room)
 *     Called after defenseValue is computed.
 *     Use to add bonuses to game.defenseValue.
 *
 *   onDamageApplied(game, defender, attacker, hitValues)
 *     Called once per hit, after HP is deducted. hitValues is an array of
 *     individual hit amounts (empty hits skipped by caller).
 *
 *   onAttackAfterDamageResolved(game, attacker, totalDamage)
 *     Called on the attacker side after damage settles.
 *
 *   onAfterDamageResolved(game, defender, attacker, totalDamage)
 *     Called on the defender side after damage settles.
 *
 *   onReroll(game, attacker)
 *     Called every time the attacker uses a reroll.
 *
 *   onRoundEnd(game, player)
 *     Called at end of round for EVERY player (attacker and defender).
 *
 *   aiScoreAttackCombo(dice, indices, game, playerId) → number
 *     Return a numeric bonus score for this attack combination.
 *     Higher = AI prefers it. Typical range: 0–50.
 *
 *   aiScoreDefenseCombo(dice, indices, game, playerId) → number
 *     Same but for defense.
 *
 *   aiFilterReroll(dice, game, playerId) → number[] | null
 *     Return array of indices to reroll, or null to use default logic.
 */

module.exports = {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:           'my_char',      // Must match filename (without .js)
  name:         '我的角色',

  // ── Base Stats ────────────────────────────────────────────────────────────
  hp:           30,
  diceSides:    [6, 6, 6, 4, 4],  // Array of die faces (length = dice pool size)
  auroraUses:   2,
  attackLevel:  3,    // How many dice the attacker picks
  defenseLevel: 3,    // How many dice the defender picks
  skillText:    '技能描述文字（显示在大厅和游戏内）',

  // ── Hooks (all optional) ──────────────────────────────────────────────────
  hooks: {
    // example:
    // onAttackConfirm(game, attacker, selectedDice, room) {
    //   game.attackPierce = true;
    //   game.log.push(`${attacker.name}触发洞穿！`);
    // },
    // aiScoreAttackCombo(dice, indices, game, playerId) { return 0; },
  },
};
