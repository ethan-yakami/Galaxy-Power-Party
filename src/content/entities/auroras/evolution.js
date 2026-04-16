module.exports = {
  id: 'evolution', name: '进化',
  faces: [
    { value: 3, hasA: false },{ value: 3, hasA: false },
    { value: 4, hasA: false },{ value: 4, hasA: false },
    { value: 6, hasA: false },{ value: 2, hasA: true  },
  ],
  effectText: 'A：若被选中，提供2点数，随后让攻击值/防御值翻倍',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker) {
      game.attackValue *= 2;
      game.log.push(`${attacker.name}触发【进化】A效果，攻击值翻倍为${game.attackValue}。`);
    },
    onDefense(game, defender) {
      game.defenseValue *= 2;
      game.log.push(`${defender.name}触发【进化】A效果，防御值翻倍为${game.defenseValue}。`);
    },
  },
};
