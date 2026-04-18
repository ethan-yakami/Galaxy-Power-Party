function readPlayerValue(container, player) {
  if (!container || !player) return 0;
  if (player.id != null && container[player.id] != null) return container[player.id];
  if (Number.isInteger(player.index) && container[player.index] != null) return container[player.index];
  if (Number.isInteger(player.playerIndex) && container[player.playerIndex] != null) return container[player.playerIndex];
  return 0;
}

module.exports = {
  id: 'revenge', name: '复仇',
  faces: [
    { value: 6, hasA: false }, { value: 6, hasA: false },
    { value: 8, hasA: false }, { value: 8, hasA: false },
    { value: 12, hasA: false }, { value: 12, hasA: false },
  ],
  effectText: '无A效果',
  conditionText: '累计受到25点伤害后，可以在攻击时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'attack') return { ok: false, reason: '复仇只能在攻击时使用。' };
      const totalDamageTaken = readPlayerValue(game && game.cumulativeDamageTaken, player);
      if (totalDamageTaken < 25) return { ok: false, reason: '复仇需要累计受到25点伤害。' };
      return { ok: true, reason: '' };
    },
  },
};
