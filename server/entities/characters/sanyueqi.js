const { countPairs } = require('../../dice');
const { getPlayerById, pushEffectEvent } = require('../../rooms');

module.exports = {
  id:           'sanyueqi',
  name:         '三月七',
  hp:           25,
  diceSides:    [6, 6, 4, 4, 4],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 3,
  skillText:    '攻击或防御时：每出现1组相同点数对，立即造成3点瞬伤',

  hooks: {
    onMainAttackConfirm(game, attacker, selectedDice, room) {
      const pairs = countPairs(selectedDice);
      if (pairs > 0) {
        const target = getPlayerById(room, game.defenderId);
        const dmg    = pairs * 3;
        const before = game.hp[target.id];
        game.hp[target.id] -= dmg;
        pushEffectEvent(game, {
          type:           'instant_damage',
          sourcePlayerId: attacker.id,
          targetPlayerId: target.id,
          amount:         dmg,
          hpBefore:       before,
          hpAfter:        game.hp[target.id],
        });
        game.log.push(`${attacker.name}触发【三月七】，${pairs}组相同点数对，造成${dmg}点瞬伤。`);
      }
    },

    onDefenseConfirm(game, defender, selectedDice, room) {
      const pairs   = countPairs(selectedDice);
      if (pairs > 0) {
        const target = getPlayerById(room, game.attackerId);
        const dmg    = pairs * 3;
        const before = game.hp[target.id];
        game.hp[target.id] -= dmg;
        pushEffectEvent(game, {
          type:           'instant_damage',
          sourcePlayerId: defender.id,
          targetPlayerId: target.id,
          amount:         dmg,
          hpBefore:       before,
          hpAfter:        game.hp[target.id],
        });
        game.log.push(`${defender.name}触发【三月七】防御，${pairs}组相同点数对，造成${dmg}点瞬伤。`);
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      const freq     = {};
      for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
      let pairs = 0;
      for (const v of Object.values(freq)) pairs += Math.floor(v / 2);
      return pairs * 4;
    },

    aiScoreDefenseCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      const freq     = {};
      for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
      let pairs = 0;
      for (const v of Object.values(freq)) pairs += Math.floor(v / 2);
      return pairs * 4;
    },
  },
};
