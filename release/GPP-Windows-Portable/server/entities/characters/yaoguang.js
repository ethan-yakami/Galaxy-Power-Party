module.exports = {
  id:           'yaoguang',
  name:         '爻光',
  hp:           35,
  diceSides:    [8, 8, 6, 6, 6],
  auroraUses:   2,
  attackLevel:  3,
  defenseLevel: 2,
  maxAttackRerolls: 4,
  skillText:    '攻击4次重投；超过2次后每次重投+2层荆棘；攻击>=18移除荆棘+1曜彩次数',

  hooks: {
    onMainAttackConfirm(game, attacker) {
      if (game.attackValue >= 18) {
        if (game.thorns[attacker.id] > 0) {
          game.log.push(`${attacker.name}攻击值>=18，移除全部${game.thorns[attacker.id]}层荆棘。`);
          game.thorns[attacker.id] = 0;
        }
        game.auroraUsesRemaining[attacker.id] += 1;
        game.log.push(`${attacker.name}获得1次曜彩骰使用次数。`);
      }
    },

    onReroll(game, attacker) {
      game.yaoguangRerollsUsed[attacker.id] += 1;
      if (game.yaoguangRerollsUsed[attacker.id] > 2) {
        game.thorns[attacker.id] += 2;
        game.log.push(`${attacker.name}超过2次重投，获得2层荆棘（当前${game.thorns[attacker.id]}层）。`);
      }
    },
  },
};
