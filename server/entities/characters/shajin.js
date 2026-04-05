const { countOddValues } = require('../../dice');
const { getPlayerById, pushEffectEvent } = require('../../rooms');

module.exports = {
  id:           'shajin',
  name:         '砂金',
  hp:           33,
  diceSides:    [8, 6, 6, 6, 4],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 2,
  skillText:    '攻击时：每有1个奇数+1层韧性；韧性满7层时瞬伤7点并移除7层。防御时韧性提供防御加成',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice, room) {
      const odds = countOddValues(selectedDice);
      if (odds > 0) {
        game.resilience[attacker.id] += odds;
        game.log.push(`${attacker.name}获得${odds}层韧性（当前${game.resilience[attacker.id]}层）。`);
      }
      while (game.resilience[attacker.id] >= 7) {
        game.resilience[attacker.id] -= 7;
        const target = getPlayerById(room, game.defenderId);
        const before = game.hp[target.id];
        game.hp[target.id] -= 7;
        pushEffectEvent(game, {
          type:           'instant_damage',
          sourcePlayerId: attacker.id,
          targetPlayerId: target.id,
          amount:         7,
          hpBefore:       before,
          hpAfter:        game.hp[target.id],
        });
        game.log.push(
          `${attacker.name}韧性满7层，对${target.name}造成7点瞬伤！` +
          `（剩余${game.resilience[attacker.id]}层）`
        );
      }
    },

    onMainDefenseConfirm(game, defender) {
      if (game.resilience[defender.id] > 0) {
        game.defenseValue += game.resilience[defender.id];
        game.log.push(
          `${defender.name}触发【韧性】防御加成+${game.resilience[defender.id]}，` +
          `防守值${game.defenseValue}。`
        );
      }
    },

    aiScoreAttackCombo(dice, indices, game, playerId) {
      const selected = indices.map((i) => dice[i]);
      const odds     = selected.filter((d) => d.value % 2 !== 0).length;
      let score      = odds * 1.5;
      if (game && game.resilience) {
        const cur = game.resilience[playerId] || 0;
        if (cur + odds >= 7) score += 10;
      }
      return score;
    },
  },
};
