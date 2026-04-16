module.exports = {
  id: 'legacy', name: '遗语',
  faces: [
    { value: 4, hasA: false },{ value: 5, hasA: false },{ value: 5, hasA: false },
    { value: 1, hasA: true  },{ value: 2, hasA: true  },{ value: 4, hasA: true  },
  ],
  effectText: 'A：若被选中，让攻击值/防守值翻倍',
  conditionText: '生命值 <= 8 时可用',
  hooks: {
    canUse(player, game) {
      if (game.hp[player.id] > 8) return { ok: false, reason: '遗语仅在生命值<=8时可用。' };
    },
    onAttack(game, attacker) {
      game.attackValue *= 2;
      game.log.push(`${attacker.name}触发【遗语】A效果，攻击值翻倍为${game.attackValue}。`);
    },
    onDefense(game, defender) {
      game.defenseValue *= 2;
      game.log.push(`${defender.name}触发【遗语】A效果，防守值翻倍为${game.defenseValue}。`);
    },
  },
};
