module.exports = {
  id: 'magicbullet', name: '魔弹',
  faces: [{value:3,hasA:false},{value:5,hasA:false},{value:7,hasA:false},
          {value:3,hasA:true} ,{value:5,hasA:true} ,{value:7,hasA:true} ],
  effectText:    'A：若被选中，提供对应点数，立刻造成3点瞬伤',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker, auroraDie, room) {
      const { getPlayerById, pushEffectEvent } = require('../../rooms');
      const defender = getPlayerById(room, game.defenderId);
      const before = game.hp[defender.id];
      game.hp[defender.id] -= 3;
      pushEffectEvent(game, { type: 'instant_damage', sourcePlayerId: attacker.id, targetPlayerId: defender.id, amount: 3, hpBefore: before, hpAfter: game.hp[defender.id] });
      game.log.push(`${attacker.name}触发【魔弹】A效果，对${defender.name}造成3点瞬伤。`);
    },
    onDefense(game, defender, auroraDie, room) {
      const { getPlayerById, pushEffectEvent } = require('../../rooms');
      const attacker = getPlayerById(room, game.attackerId);
      const before = game.hp[attacker.id];
      game.hp[attacker.id] -= 3;
      pushEffectEvent(game, { type: 'instant_damage', sourcePlayerId: defender.id, targetPlayerId: attacker.id, amount: 3, hpBefore: before, hpAfter: game.hp[attacker.id] });
      game.log.push(`${defender.name}触发【魔弹】A效果，对${attacker.name}造成3点瞬伤。`);
    },
  },
};
