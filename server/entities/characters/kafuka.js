const { countUniqueValues } = require('../../dice');
const { getPlayerById } = require('../../rooms');

module.exports = {
  id:           'kafuka',
  name:         '卡芙卡',
  hp:           30,
  diceSides:    [6, 6, 4, 4, 4],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 3,
  skillText:    '攻击时：每有一个不同点数使对方+1层中毒；防御受伤则移除对方1层中毒',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice, room) {
      const defender = getPlayerById(room, game.defenderId);
      const uniq     = countUniqueValues(selectedDice);
      if (uniq > 0) {
        game.poison[defender.id] += uniq;
        game.log.push(
          `${attacker.name}触发【中毒】，使${defender.name}陷入${uniq}层中毒` +
          `（当前${game.poison[defender.id]}层）。`
        );
      }
    },

    onAfterDamageResolved(game, defender, attacker, totalDamage) {
      if (totalDamage > 0 && game.poison[attacker.id] > 0) {
        game.poison[attacker.id] -= 1;
        game.log.push(
          `${defender.name}防御受伤，移除${attacker.name}1层中毒` +
          `（剩余${game.poison[attacker.id]}层）。`
        );
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      return new Set(selected.map((d) => d.value)).size * 2;
    },
  },
};
