module.exports = {
  id: 'berserker', name: '战狂',
  faces: [
    { value: 4,  hasA: false },{ value: 4,  hasA: false },
    { value: 8,  hasA: true  },{ value: 8,  hasA: true  },
    { value: 12, hasA: true  },{ value: 12, hasA: true  },
  ],
  effectText: 'A：若被选中，提供对应点数，获得点数/4层荆棘',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker, auroraDie) {
      const layers = Math.floor(auroraDie.value / 4);
      game.thorns[attacker.id] += layers;
      game.log.push(`${attacker.name}触发【战狂】A效果，获得${layers}层荆棘（当前${game.thorns[attacker.id]}层）。`);
    },
    onDefense(game, defender, auroraDie) {
      const layers = Math.floor(auroraDie.value / 4);
      game.thorns[defender.id] += layers;
      game.log.push(`${defender.name}触发【战狂】A效果，获得${layers}层荆棘（当前${game.thorns[defender.id]}层）。`);
    },
  },
};
