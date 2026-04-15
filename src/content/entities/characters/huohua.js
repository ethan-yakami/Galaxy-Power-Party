const { hasDuplicates } = require('../../dice');

module.exports = {
  id:           'huohua',
  name:         '火花',
  hp:           22,
  diceSides:    [8, 6, 6, 4, 4],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 3,
  skillText:    '攻击或防御时：选定骰子有相同点数则获得骇入（将对手最大骰变为2）',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice) {
      if (hasDuplicates(selectedDice)) {
        game.hackActive[attacker.id] = true;
        game.log.push(`${attacker.name}触发【骇入】！`);
      }
    },

    onDefenseConfirm(game, defender, selectedDice) {
      if (hasDuplicates(selectedDice)) {
        game.hackActive[defender.id] = true;
        game.log.push(`${defender.name}触发【骇入】！`);
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      const seen     = new Set();
      for (const d of selected) {
        if (seen.has(d.value)) return 8;
        seen.add(d.value);
      }
      return 0;
    },

    aiScoreDefenseCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      const seen     = new Set();
      for (const d of selected) {
        if (seen.has(d.value)) return 8;
        seen.add(d.value);
      }
      return 0;
    },
  },
};
