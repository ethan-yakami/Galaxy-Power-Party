module.exports = {
  id: 'repeater', name: '复读',
  faces: [
    { value: 1, hasA: false },{ value: 1, hasA: false },
    { value: 4, hasA: false },{ value: 4, hasA: false },
    { value: 4, hasA: true  },{ value: 4, hasA: true  },
  ],
  effectText: 'A：若被选中，本轮次获得连击',
  conditionText: '累计选择两次骰面4后，可在攻击时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'attack') return { ok: false, reason: '复读只能在攻击时使用。' };
      if ((game.selectedFourCount[player.id] || 0) < 2) return { ok: false, reason: '复读需要累计选择两次点数4。' };
    },
    onAttack(game, attacker) {
      game.extraAttackQueued = true;
      game.log.push(`${attacker.name}触发【复读】A效果，本轮将额外进行一次攻击。`);
    },
    onDefense(game, defender) {
      // 保留该分支以兼容统一 hook 结构；当前 canUse 已禁止防守侧触发。
      game.extraAttackQueued = true;
      game.log.push(`${defender.name}触发【复读】A效果，本轮将额外进行一次攻击。`);
    },
  },
};
