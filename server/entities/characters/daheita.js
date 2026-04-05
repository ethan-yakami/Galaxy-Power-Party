module.exports = {
  id:           'daheita',
  name:         '大黑塔',
  hp:           42,
  diceSides:    [8, 8, 6, 6, 6],
  auroraUses:   2,
  attackLevel:  3,
  defenseLevel: 2,
  skillText:    '回合结束+1曜彩次数；A效果触发>=4后，每回合选择骰子后触发跃升（最小点变最大）',

  hooks: {
    onRoundEnd(game, player) {
      game.auroraUsesRemaining[player.id] += 1;
      game.log.push(`${player.name}触发【大黑塔】回合结束效果，曜彩骰次数+1。`);
    },
    // Ascension condition is checked in skills.js via applyAscension
    // (reads game.auroraAEffectCount[player.id] >= 4)
  },
};
