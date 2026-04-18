module.exports = {
  id: 'destiny', name: '命运',
  faces: [
    { value: 1,  hasA: true },{ value: 3,  hasA: true },{ value: 3,  hasA: true },
    { value: 12, hasA: true },{ value: 12, hasA: true },{ value: 16, hasA: true },
  ],
  effectText: 'A：若被选中，提供对应点数，但获得命定',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker) {
      game.log.push(`${attacker.name}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
    },
    onDefense(game, defender) {
      game.log.push(`${defender.name}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
    },
  },
};
