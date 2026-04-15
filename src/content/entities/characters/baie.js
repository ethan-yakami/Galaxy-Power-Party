const { areAllSame } = require('../../dice');

module.exports = {
  id:           'baie',
  name:         '白厄',
  hp:           20,
  diceSides:    [8, 8, 6, 6, 6],
  auroraUses:   2,
  attackLevel:  4,
  defenseLevel: 2,
  skillText:    '攻击后回复造成伤害50%（下取整）；防御全同点时本回合最低降到1（每局1次）',

  hooks: {
    onDefenseConfirm(game, defender, selectedDice) {
      if (!game.whiteeGuardUsed[defender.id] && areAllSame(selectedDice)) {
        game.whiteeGuardActive[defender.id] = true;
        game.whiteeGuardUsed[defender.id]   = true;
        game.log.push(`${defender.name}触发【白厄】守护，本回合生命最低保留至1（本局限1次）。`);
      }
    },
    onAttackAfterDamageResolved(game, attacker, totalDamage) {
      if (totalDamage > 0) {
        const { pushEffectEvent } = require('../../rooms');
        const heal     = Math.floor(totalDamage * 0.5);
        const before   = game.hp[attacker.id];
        const realHeal = Math.min(heal, game.maxHp[attacker.id] - before);
        if (realHeal > 0) {
          game.hp[attacker.id] = before + realHeal;
          pushEffectEvent(game, { type: 'heal', playerId: attacker.id, amount: realHeal, hpBefore: before, hpAfter: game.hp[attacker.id] });
          game.log.push(`${attacker.name}触发【白厄】吸收，回复${realHeal}点生命。`);
        }
      }
    },
    aiScoreDefenseCombo(dice, indices, game, playerId) {
      const selected = indices.map((i) => dice[i]);
      if (game && !game.whiteeGuardUsed[playerId]) {
        if (selected.length > 0 && selected.every((d) => d.value === selected[0].value)) return 15;
      }
      return 0;
    },
  },
};
