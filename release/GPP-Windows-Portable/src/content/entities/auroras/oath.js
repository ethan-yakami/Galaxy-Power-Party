module.exports = {
  id: 'oath', name: '誓言',
  faces: [
    { value: 8, hasA: false },{ value: 8, hasA: false },
    { value: 4, hasA: true  },{ value: 4, hasA: true  },
    { value: 6, hasA: true  },{ value: 6, hasA: true  },
  ],
  effectText: 'A：若被选中，提供对应点数，本回合获得不屈',
  conditionText: '只能在防御时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'defense') return { ok: false, reason: '誓言只能在防御时使用。' };
    },
    onDefense(game, defender) {
      game.unyielding[defender.id] = true;
      game.log.push(`${defender.name}触发【誓言】A效果，本回合获得不屈（生命值不会降至0以下）。`);
    },
  },
};
