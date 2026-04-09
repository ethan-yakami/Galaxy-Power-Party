const { countDistinctPairedValues } = require('../../dice');

module.exports = {
  id:           'liuying',
  name:         '流萤',
  hp:           28,
  diceSides:    [6, 6, 6, 4, 4],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 3,
  skillText:    '攻击时：2组相同点数则连击；满生命时攻击值+5',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice) {
      if (countDistinctPairedValues(selectedDice) >= 2) {
        game.extraAttackQueued = true;
        game.log.push(`${attacker.name}触发【连击】！本轮将进行两次攻击。`);
      }
    },

    onMainAttackConfirm(game, attacker) {
      if (game.hp[attacker.id] === game.maxHp[attacker.id]) {
        game.attackValue += 5;
        game.log.push(`${attacker.name}满生命值，攻击值+5（当前${game.attackValue}）。`);
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      const freq     = {};
      for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
      let pairedValues = 0;
      for (const v of Object.values(freq)) if (v >= 2) pairedValues++;
      if (pairedValues >= 2) return 15;
      return 0;
    },
  },
};
