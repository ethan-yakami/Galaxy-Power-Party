const { areAllEven, upgradeSide } = require('../../dice');

module.exports = {
  id:           'zhigengniao',
  name:         '知更鸟',
  hp:           30,
  diceSides:    [6, 6, 4, 4, 4],
  auroraUses:   0,
  attackLevel:  4,
  defenseLevel: 3,
  skillText:    '攻击时：若所选骰子全为偶数，则这些骰子升级（4->6->8->12）',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice) {
      if (areAllEven(selectedDice)) {
        let upgraded = 0;
        for (const die of selectedDice) {
          if (die.isAurora || die.slotId === null || die.slotId === undefined) continue;
          const oldSide = game.diceSidesByPlayer[attacker.id][die.slotId];
          const next    = upgradeSide(oldSide);
          if (next !== oldSide) {
            game.diceSidesByPlayer[attacker.id][die.slotId] = next;
            upgraded += 1;
          }
        }
        if (upgraded > 0) {
          game.log.push(`${attacker.name}触发【升级】效果，${upgraded}枚骰子面数提升。`);
        }
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      if (selected.every((d) => d.value % 2 === 0)) return 8;
      return 0;
    },

    aiFilterReroll(dice) {
      const oddNonAurora = [];
      for (let i = 0; i < dice.length; i++) {
        if (!dice[i].isAurora && dice[i].value % 2 !== 0) oddNonAurora.push(i);
      }
      if (oddNonAurora.length > 0 && oddNonAurora.length <= 3) return oddNonAurora;
      return null;
    },
  },
};
