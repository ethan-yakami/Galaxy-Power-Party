module.exports = {
  id: 'revenge', name: '复仇',
  faces: [
    { value: 6,  hasA: false },{ value: 6,  hasA: false },
    { value: 8,  hasA: false },{ value: 8,  hasA: false },
    { value: 12, hasA: false },{ value: 12, hasA: false },
  ],
  effectText: '无A效果',
  conditionText: '累计受到25点伤害后，可以在攻击时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'attack') return { ok: false, reason: '复仇只能在攻击时使用。' };
      if ((game.cumulativeDamageTaken[player.id] || 0) < 25) return { ok: false, reason: '复仇需要累计受到25点伤害。' };
    },
  },
};
