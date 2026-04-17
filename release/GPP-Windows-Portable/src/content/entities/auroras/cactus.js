module.exports = {
  id: 'cactus', name: '仙人球',
  faces: [
    { value: 4, hasA: true },{ value: 5, hasA: true },{ value: 6, hasA: true },
    { value: 7, hasA: true },{ value: 8, hasA: true },{ value: 9, hasA: true },
  ],
  effectText: 'A：若被选中，提供对应点数，本回合获得反击',
  conditionText: '只能在防御时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'defense') return { ok: false, reason: '仙人球只能在防御时使用。' };
    },
    onDefense(game, defender) {
      game.counterActive[defender.id] = true;
      game.log.push(`${defender.name}触发【仙人球】A效果，本回合获得反击。`);
    },
  },
};
