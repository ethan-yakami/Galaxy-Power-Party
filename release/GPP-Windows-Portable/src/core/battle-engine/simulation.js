const { createRuntime } = require('./runtime');
const { cloneState } = require('./state');
const { enumerateActions, applyActionInPlace, isTerminal } = require('./reducer');
const { hashSeed, nextInt } = require('./rng');

function chooseRandomAction(state, actions, count) {
  return actions[nextInt(state, count)];
}

function rolloutMany(initialState, policyA, policyB, iterations, seedBase, options = {}) {
  const maxSteps = options.maxSteps || 512;
  const runtime = options.runtime || createRuntime();
  const actionBuffer = options.actionBuffer || new Uint16Array(128);
  const working = cloneState(initialState);

  const summary = {
    iterations,
    wins: [0, 0],
    draws: 0,
    totalSteps: 0,
    totalRemainingHp: [0, 0],
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    cloneState(initialState, working);
    if (seedBase !== undefined) {
      working.rngState = hashSeed(`${seedBase}:${iter}`);
    }

    let steps = 0;
    while (!isTerminal(working) && steps < maxSteps) {
      const count = enumerateActions(working, actionBuffer);
      if (!count) break;
      const actor = (
        working.phase === 2 || working.phase === 3
          ? working.defender
          : working.attacker
      );
      const policy = actor === 0 ? policyA : policyB;
      const action = typeof policy === 'function'
        ? policy(working, actionBuffer, count) || chooseRandomAction(working, actionBuffer, count)
        : chooseRandomAction(working, actionBuffer, count);
      applyActionInPlace(working, action, runtime);
      steps += 1;
    }

    summary.totalSteps += steps;
    summary.totalRemainingHp[0] += working.hp[0];
    summary.totalRemainingHp[1] += working.hp[1];
    if (working.winner === 0 || working.winner === 1) {
      summary.wins[working.winner] += 1;
    } else {
      summary.draws += 1;
    }
  }

  summary.averageSteps = iterations > 0 ? summary.totalSteps / iterations : 0;
  summary.averageRemainingHp = iterations > 0
    ? [
      summary.totalRemainingHp[0] / iterations,
      summary.totalRemainingHp[1] / iterations,
    ]
    : [0, 0];
  return summary;
}

module.exports = {
  rolloutMany,
};
