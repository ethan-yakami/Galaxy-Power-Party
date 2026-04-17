module.exports = {
  id: 'gambler', name: '赌徒',
  faces: [
    { value: 1,  hasA: false },{ value: 1,  hasA: false },
    { value: 6,  hasA: false },{ value: 8,  hasA: false },
    { value: 10, hasA: false },{ value: 12, hasA: false },
  ],
  effectText: '无A效果',
  conditionText: '仅能在前4回合内使用',
  hooks: {
    canUse(player, game) {
      if (game.round > 4) return { ok: false, reason: '赌徒仅能在前4回合内使用。' };
    },
  },
};
