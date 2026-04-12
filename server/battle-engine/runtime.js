function noop() {}

function defaultPlayerName(index) {
  return `P${index + 1}`;
}

function defaultPlayerId(index) {
  return `P${index + 1}`;
}

function createScratch() {
  return {
    actionBuffer: new Uint16Array(128),
    hits: new Int16Array(2),
  };
}

function createRuntime(options = {}) {
  const runtime = {
    logEnabled: typeof options.log === 'function',
    effectEnabled: typeof options.effect === 'function',
    getPlayerName: typeof options.getPlayerName === 'function' ? options.getPlayerName : defaultPlayerName,
    getPlayerId: typeof options.getPlayerId === 'function' ? options.getPlayerId : defaultPlayerId,
    log: typeof options.log === 'function' ? options.log : noop,
    effect: typeof options.effect === 'function' ? options.effect : noop,
    scratch: options.scratch || createScratch(),
  };

  runtime.damage = function damage(state, sourcePlayer, targetPlayer, amount, meta = {}) {
    if (!amount || amount <= 0) return 0;
    const before = state.hp[targetPlayer];
    state.hp[targetPlayer] = before - amount;
    if (runtime.effectEnabled) {
      runtime.effect({
        type: meta.type || 'instant_damage',
        sourcePlayerIndex: sourcePlayer,
        targetPlayerIndex: targetPlayer,
        amount,
        hpBefore: before,
        hpAfter: state.hp[targetPlayer],
        attackValue: meta.attackValue,
        defenseValue: meta.defenseValue,
        hits: meta.hits,
        forceField: meta.forceField,
        pierce: meta.pierce,
      });
    }
    return amount;
  };

  runtime.heal = function heal(state, playerIndex, amount, meta = {}) {
    if (!amount || amount <= 0) return 0;
    const before = state.hp[playerIndex];
    const room = state.maxHp[playerIndex] - before;
    if (room <= 0) return 0;
    const real = amount > room ? room : amount;
    state.hp[playerIndex] = before + real;
    if (runtime.effectEnabled) {
      runtime.effect({
        type: meta.type || 'heal',
        playerIndex,
        amount: real,
        hpBefore: before,
        hpAfter: state.hp[playerIndex],
      });
    }
    return real;
  };

  return runtime;
}

const DEFAULT_RUNTIME = createRuntime();

module.exports = {
  createScratch,
  createRuntime,
  DEFAULT_RUNTIME,
};
