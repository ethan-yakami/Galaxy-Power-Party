module.exports = {
  id: 'bigredbutton', name: '大红按钮',
  faces: [{value:6,hasA:true},{value:6,hasA:true},{value:6,hasA:true},
          {value:8,hasA:true},{value:8,hasA:true},{value:8,hasA:true}],
  effectText:    'A：若被选中，提供对应点数，立刻触发背水',
  conditionText: '回合数>=5时，可以在攻击时使用',
  hooks: {
    canUse(player, game, role) {
      if (role !== 'attack') return { ok: false, reason: '大红按钮只能在攻击时使用。' };
      if (game.round < 5)   return { ok: false, reason: '大红按钮需要回合数>=5。' };
    },
    onAttack(game, attacker) {
      const { pushEffectEvent } = require('../../rooms');
      const before = game.hp[attacker.id];
      const lost   = before - 1;
      if (lost > 0) {
        game.hp[attacker.id] = 1;
        game.desperateBonus[attacker.id] += lost;
        pushEffectEvent(game, { type: 'instant_damage', sourcePlayerId: attacker.id, targetPlayerId: attacker.id, amount: lost, hpBefore: before, hpAfter: 1 });
        game.log.push(`${attacker.name}触发【大红按钮】A效果，背水！生命值降为1，攻击值+${lost}。`);
      } else {
        game.log.push(`${attacker.name}触发【大红按钮】A效果，但生命值已为1。`);
      }
    },
  },
};
