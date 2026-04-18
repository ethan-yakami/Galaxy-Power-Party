module.exports = {
  id: 'miracle', name: '奇迹',
  faces: [
    { value: 99, hasA: false },{ value: 99, hasA: false },{ value: 99, hasA: false },
    { value: 99, hasA: false },{ value: 99, hasA: false },{ value: 99, hasA: false },
  ],
  effectText: '无A效果',
  conditionText: '累计选择9次骰面1后，可以在攻击时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'attack') return { ok: false, reason: '奇迹只能在攻击时使用。' };
      if ((game.selectedOneCount[player.id] || 0) < 9) return { ok: false, reason: '奇迹需要累计选择9次骰面1。' };
    },
  },
};
