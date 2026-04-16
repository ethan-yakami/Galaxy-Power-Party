module.exports = {
  id: 'medic', name: '医嘱',
  faces: [{value:1,hasA:true},{value:2,hasA:true},{value:3,hasA:true},
          {value:4,hasA:true},{value:6,hasA:true},{value:6,hasA:true}],
  effectText:    'A：若被选中，为自己回复与骰面点数相同的生命值（不超过角色初始生命值）',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker, auroraDie) {
      const { pushEffectEvent } = require('../../rooms');
      const before = game.hp[attacker.id];
      const healed = Math.min(auroraDie.value, game.maxHp[attacker.id] - before);
      if (healed > 0) {
        game.hp[attacker.id] = before + healed;
        pushEffectEvent(game, { type: 'heal', playerId: attacker.id, amount: healed, hpBefore: before, hpAfter: game.hp[attacker.id] });
        game.log.push(`${attacker.name}触发【医嘱】A效果，回复${healed}点生命值。`);
      } else {
        game.log.push(`${attacker.name}触发【医嘱】A效果，但生命值已满。`);
      }
    },
    onDefense(game, defender, auroraDie) {
      const { pushEffectEvent } = require('../../rooms');
      const before = game.hp[defender.id];
      const healed = Math.min(auroraDie.value, game.maxHp[defender.id] - before);
      if (healed > 0) {
        game.hp[defender.id] = before + healed;
        pushEffectEvent(game, { type: 'heal', playerId: defender.id, amount: healed, hpBefore: before, hpAfter: game.hp[defender.id] });
        game.log.push(`${defender.name}触发【医嘱】A效果，回复${healed}点生命值。`);
      } else {
        game.log.push(`${defender.name}触发【医嘱】A效果，但生命值已满。`);
      }
    },
  },
};
