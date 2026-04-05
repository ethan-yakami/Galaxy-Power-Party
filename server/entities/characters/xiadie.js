const {
  areAllValues,
  countDistinctPairedValues,
  areAllEven,
  upgradeSide,
  areAllSame,
  countUniqueValues,
  countOddValues,
  countPairs,
} = require('../../dice');
const { getPlayerById, pushEffectEvent } = require('../../rooms');

module.exports = {
  id:           'xiadie',
  name:         '遐蝶',
  hp:           27,
  diceSides:    [8, 8, 6, 4, 4],
  auroraUses:   2,
  attackLevel:  3,
  defenseLevel: 2,
  skillText:    '防御时：单次受伤>=8则攻防+1；受伤且<=5时立即对对手造成3点瞬伤',

  hooks: {
    onDamageApplied(game, defender, attacker, hitValues) {
      for (const hit of hitValues) {
        if (hit >= 8) {
          game.attackLevel[defender.id]  += 1;
          game.defenseLevel[defender.id] += 1;
          game.log.push(`${defender.name}触发【遐蝶】防御成长：单次伤害>=8，攻防等级+1。`);
        }
        if (hit > 0 && hit <= 5) {
          const before = game.hp[attacker.id];
          const damage = 3;
          game.hp[attacker.id] -= damage;
          pushEffectEvent(game, {
            type:           'instant_damage',
            sourcePlayerId: defender.id,
            targetPlayerId: attacker.id,
            amount:         damage,
            hpBefore:       before,
            hpAfter:        game.hp[attacker.id],
          });
          game.log.push(`${defender.name}触发【遐蝶】瞬伤，对${attacker.name}造成3点无视轮次伤害。`);
        }
      }
    },
  },
};
