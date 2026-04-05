const { areAllValues } = require('../../dice');

module.exports = {
  id:           'huangquan',
  name:         '黄泉',
  hp:           33,
  diceSides:    [8, 6, 4, 4, 4],
  auroraUses:   2,
  attackLevel:  2,
  defenseLevel: 3,
  skillText:    '攻击时：若所选点数全为4则洞穿（无视防御与力场），且每次洞穿攻等+1',

  hooks: {
    onAttackConfirm(game, attacker, selectedDice) {
      if (areAllValues(selectedDice, 4)) {
        game.attackPierce = true;
        game.attackLevel[attacker.id] += 1;
        game.log.push(`${attacker.name}触发【洞穿】！本次攻击无视防御与力场，并且攻击等级+1。`);
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      if (selected.every((d) => d.value === 4)) return 50;
      return 0;
    },

    aiFilterReroll(dice, game, playerId) {
      const needCount = game.attackLevel[playerId];
      const foursCount = dice.filter((d) => !d.isAurora && d.value === 4).length;
      if (foursCount >= needCount - 1) {
        const toReroll = [];
        for (let i = 0; i < dice.length; i++) {
          if (!dice[i].isAurora && dice[i].value !== 4) toReroll.push(i);
        }
        if (toReroll.length > 0 && toReroll.length <= 3) return toReroll;
      }
      return null;
    },
  },
};
