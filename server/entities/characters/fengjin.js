const { areAllValues } = require('../../dice');
const { pushEffectEvent } = require('../../rooms');

module.exports = {
  id:           'fengjin',
  name:         '风堇',
  hp:           28,
  diceSides:    [8, 6, 6, 6, 6],
  auroraUses:   2,
  attackLevel:  2,
  defenseLevel: 2,
  skillText:    '攻击时力量层数加成攻击值；攻击后累积攻击值50%为力量（全6则100%+治疗6）',

  hooks: {
    onMainAttackConfirm(game, attacker) {
      if (game.power[attacker.id] > 0) {
        game.attackValue += game.power[attacker.id];
        game.log.push(`${attacker.name}触发【力量】加成+${game.power[attacker.id]}，攻击值${game.attackValue}。`);
      }
    },

    onAttackAfterDamageResolved(game, attacker) {
      const atkSelectedDice = game.attackSelection.map((idx) => game.attackDice[idx]);
      if (areAllValues(atkSelectedDice, 6)) {
        game.power[attacker.id] += game.attackValue;
        const before  = game.hp[attacker.id];
        const healAmt = Math.min(6, game.maxHp[attacker.id] - before);
        if (healAmt > 0) {
          game.hp[attacker.id] += healAmt;
          pushEffectEvent(game, {
            type:     'heal',
            playerId: attacker.id,
            amount:   healAmt,
            hpBefore: before,
            hpAfter:  game.hp[attacker.id],
          });
        }
        game.log.push(
          `${attacker.name}全6触发，力量累积100%（当前${game.power[attacker.id]}层），` +
          `治疗${healAmt > 0 ? healAmt : 0}点。`
        );
      } else {
        const add = Math.floor(game.attackValue * 0.5);
        game.power[attacker.id] += add;
        game.log.push(`${attacker.name}力量累积+${add}（当前${game.power[attacker.id]}层）。`);
      }
    },

    aiScoreAttackCombo(dice, indices) {
      const selected = indices.map((i) => dice[i]);
      if (selected.every((d) => d.value === 6)) return 20;
      return 0;
    },
  },
};
