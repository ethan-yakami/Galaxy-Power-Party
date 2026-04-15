module.exports = {
  id:           'danheng',
  name:         '丹恒·腾荒',
  hp:           25,
  diceSides:    [8, 8, 6, 6, 6],
  auroraUses:   2,
  attackLevel:  3,
  defenseLevel: 2,
  skillText:    '攻击值>=18时：下次防御等级+3并获得反击（防御后还原等级）',
  hooks: {
    onMainAttackConfirm(game, attacker) {
      if (game.attackValue >= 18) {
        game.danhengCounterReady[attacker.id] = true;
        game.log.push(`${attacker.name}攻击值>=18，下次防御将获得反击！`);
      }
    },
    onDefenseRoll(game, defender) {
      if (game.danhengCounterReady[defender.id]) {
        game.defenseLevel[defender.id] += 3;
        game.log.push(`${defender.name}触发【反击】准备，防御等级+3。`);
      }
    },
    onAfterDamageResolved(game, defender, attacker) {
      if (game.danhengCounterReady[defender.id]) {
        const { pushEffectEvent } = require('../../rooms');
        game.defenseLevel[defender.id]       -= 3;
        game.danhengCounterReady[defender.id] = false;
        if (!game.attackPierce && game.defenseValue > game.attackValue) {
          const counterDmg = game.defenseValue - game.attackValue;
          const before = game.hp[attacker.id];
          game.hp[attacker.id] -= counterDmg;
          pushEffectEvent(game, { type: 'instant_damage', sourcePlayerId: defender.id, targetPlayerId: attacker.id, amount: counterDmg, hpBefore: before, hpAfter: game.hp[attacker.id] });
          game.log.push(`${defender.name}触发【反击】，对${attacker.name}造成${counterDmg}点反击伤害！`);
        }
      }
    },
  },
};
