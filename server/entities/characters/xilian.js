module.exports = {
  id:           'xilian',
  name:         '昔涟',
  hp:           30,
  diceSides:    [8, 6, 6, 6, 4],
  auroraUses:   2,
  attackLevel:  3,
  defenseLevel: 2,
  maxAttackRerolls: 2,
  skillText:    '累计攻防值超过24后，攻击等级变为5，此后每回合获得跃升',

  hooks: {
    shouldAscend(game, player) {
      return !!game.xilianAscensionActive[player.id];
    },
    onMainAttackConfirm(game, attacker) {
      game.xilianCumulative[attacker.id] += game.attackValue;
      if (!game.xilianAscensionActive[attacker.id] && game.xilianCumulative[attacker.id] > 24) {
        game.xilianAscensionActive[attacker.id] = true;
        game.attackLevel[attacker.id]           = 5;
        game.log.push(`${attacker.name}累计攻防值超过24，攻击等级变为5，此后每回合获得跃升！`);
      }
    },

    onMainDefenseConfirm(game, defender) {
      game.xilianCumulative[defender.id] += game.defenseValue;
      if (!game.xilianAscensionActive[defender.id] && game.xilianCumulative[defender.id] > 24) {
        game.xilianAscensionActive[defender.id] = true;
        game.attackLevel[defender.id]           = 5;
        game.log.push(`${defender.name}累计攻防值超过24，攻击防等级变为5，此后每回合获得跃升！`);
      }
    },
  },
};
