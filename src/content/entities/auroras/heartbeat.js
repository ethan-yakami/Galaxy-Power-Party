module.exports = {
  id: 'heartbeat', name: '心跳',
  faces: [
    { value: 1, hasA: false },{ value: 1, hasA: false },
    { value: 1, hasA: false },{ value: 1, hasA: false },
    { value: 9, hasA: true  },{ value: 9, hasA: true  },
  ],
  effectText: 'A：若被选中，提供9点数，获得1次曜彩骰使用次数',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker) {
      game.auroraUsesRemaining[attacker.id] += 1;
      game.log.push(`${attacker.name}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
    },
    onDefense(game, defender) {
      game.auroraUsesRemaining[defender.id] += 1;
      game.log.push(`${defender.name}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
    },
  },
};
