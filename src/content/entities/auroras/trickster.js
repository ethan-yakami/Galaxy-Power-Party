module.exports = {
  id: 'trickster', name: '奇术师',
  faces: [
    { value: 4, hasA: false },{ value: 4, hasA: false },{ value: 4, hasA: false },
    { value: 4, hasA: true  },{ value: 6, hasA: true  },{ value: 6, hasA: true  },
  ],
  effectText: 'A：若被选中，提供对应点数，本回合获得骇入',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker) {
      game.hackActive[attacker.id] = true;
      game.log.push(`${attacker.name}触发【奇术师】A效果，本回合获得骇入。`);
    },
    onDefense(game, defender) {
      game.hackActive[defender.id] = true;
      game.log.push(`${defender.name}触发【奇术师】A效果，本回合获得骇入。`);
    },
  },
};
