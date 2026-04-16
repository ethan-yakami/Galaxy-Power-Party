module.exports = {
  id: 'starshield', name: '星盾',
  faces: [
    { value: 7, hasA: false },{ value: 7, hasA: false },{ value: 7, hasA: false },
    { value: 1, hasA: true  },{ value: 1, hasA: true  },{ value: 1, hasA: true  },
  ],
  effectText: 'A：若被选中，本轮次获得力场（不会受到常规攻击伤害）',
  conditionText: '只能在防守时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'defense') return { ok: false, reason: '星盾只能在防守时使用。' };
    },
    onAttack(game, attacker) {
      // 保留该分支以兼容统一 hook 结构；当前 canUse 已禁止攻击侧触发。
      game.forceField[attacker.id] = true;
      game.log.push(`${attacker.name}触发【星盾】A效果，本轮获得力场。`);
    },
    onDefense(game, defender) {
      game.forceField[defender.id] = true;
      game.log.push(`${defender.name}触发【星盾】A效果，本轮获得力场。`);
    },
  },
};
