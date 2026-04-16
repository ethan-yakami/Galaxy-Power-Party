module.exports = {
  id: 'loan', name: '贷款',
  faces: [
    { value: 2, hasA: true },{ value: 2, hasA: true },
    { value: 3, hasA: true },{ value: 3, hasA: true },
    { value: 4, hasA: true },{ value: 4, hasA: true },
  ],
  effectText: 'A：若被选中，提供对应点数，获得相同数值层的超载',
  conditionText: '随时可用',
  hooks: {
    onAttack(game, attacker, auroraDie) {
      game.overload[attacker.id] += auroraDie.value;
      game.log.push(`${attacker.name}触发【贷款】A效果，获得${auroraDie.value}层超载（当前${game.overload[attacker.id]}层）。`);
    },
    onDefense(game, defender, auroraDie) {
      game.overload[defender.id] += auroraDie.value;
      game.log.push(`${defender.name}触发【贷款】A效果，获得${auroraDie.value}层超载（当前${game.overload[defender.id]}层）。`);
    },
  },
};
