const {
  SOURCE_NORMAL,
  SOURCE_AURORA,
  ROLE_ATTACK,
  ROLE_DEFENSE,
  PHASE_ATTACK_ROLL,
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_ROLL,
  PHASE_DEFENSE_SELECT,
  PHASE_ENDED,
  PHASE_NAMES,
  STATUS_IN_GAME,
  STATUS_ENDED,
  OPCODES,
  VALUE_NONE,
} = require('./constants');
const { encodeAction, getActionMask, getActionOpcode, fullMask, POPCOUNT } = require('./actions');
const { nextInt } = require('./rng');
const { DEFAULT_RUNTIME } = require('./runtime');
const { resetExchangeState, resetRoundFlags, playerOffset } = require('./state');
const { canUseAuroraRule } = require('./rules/auroras');
const { applyAscension } = require('./rules/characters');
const {
  countSelectedValue,
  getSelectedIndices,
  sumMask,
  findHighestSelectedNonAuroraIndex,
} = require('./rules/helpers');
const weatherRules = require('./rules/weather');

function getNeedCount(level, rollCount) {
  if (rollCount <= 0) return 0;
  if (level < 1) return 1;
  if (level > rollCount) return rollCount;
  return level;
}

function buildContext(runtime, actor, opponent, roll, mask, role) {
  const scratch = runtime.scratch;
  if (!scratch.ctx) scratch.ctx = {};
  const ctx = scratch.ctx;
  ctx.actor = actor;
  ctx.opponent = opponent;
  ctx.roll = roll;
  ctx.mask = mask;
  ctx.role = role;
  ctx.selectedIndices = getSelectedIndices(mask);
  ctx.auroraValue = 0;
  ctx.totalDamage = 0;
  ctx.attackValue = VALUE_NONE;
  ctx.defenseValue = VALUE_NONE;
  ctx.hits = scratch.hits;
  ctx.hitCount = 0;
  return ctx;
}

function getCharacterBehavior(state, playerIndex) {
  return state.catalog.characters[state.characterIndex[playerIndex]].behavior;
}

function getAuroraRecord(state, playerIndex) {
  return state.catalog.auroras[state.auroraIndex[playerIndex]];
}

function getAuroraBehavior(state, playerIndex) {
  return getAuroraRecord(state, playerIndex).behavior;
}

function buildAttackBonusParts(state, playerIndex) {
  return {
    power: state.power[playerIndex],
    overload: state.overload[playerIndex],
    desperate: state.desperateBonus[playerIndex],
  };
}

function applyGlobalAttackBonuses(state, playerIndex, runtime, previousParts = null) {
  const currentParts = buildAttackBonusParts(state, playerIndex);
  const prev = previousParts || { power: 0, overload: 0, desperate: 0 };

  const powerDelta = currentParts.power - prev.power;
  const overloadDelta = currentParts.overload - prev.overload;
  const desperateDelta = currentParts.desperate - prev.desperate;
  const totalDelta = powerDelta + overloadDelta + desperateDelta;

  if (totalDelta > 0) {
    state.attackValue += totalDelta;
    if (runtime.logEnabled) {
      const labels = [];
      if (powerDelta > 0) labels.push(`力量+${powerDelta}`);
      if (overloadDelta > 0) labels.push(`超载+${overloadDelta}`);
      if (desperateDelta > 0) labels.push(`背水+${desperateDelta}`);
      runtime.log(`${runtime.getPlayerName(playerIndex)}获得攻击加成：${labels.join('｜')}，攻击值${state.attackValue}。`);
    }
  }

  return currentParts;
}

function canUseAurora(state, playerIndex, role) {
  if (state.auroraUsesRemaining[playerIndex] <= 0) {
    return { ok: false, reason: '曜彩骰使用次数已耗尽。' };
  }
  if (state.roundAuroraUsed[playerIndex]) {
    return { ok: false, reason: '本轮你已使用过曜彩骰。' };
  }
  const roll = role === ROLE_ATTACK ? state.attackRoll : state.defenseRoll;
  if (roll.count >= 6) {
    return { ok: false, reason: '骰池已满。' };
  }
  const behavior = getAuroraBehavior(state, playerIndex);
  const verdict = canUseAuroraRule(behavior, state, {
    actor: playerIndex,
    role: role === ROLE_ATTACK ? 'attack' : 'defense',
  });
  return verdict || { ok: true, reason: '' };
}

function sortRoll(roll) {
  for (let i = 1; i < roll.count; i += 1) {
    let j = i;
    while (j > 0) {
      const left = j - 1;
      const swap = (
        roll.values[left] > roll.values[j]
        || (
          roll.values[left] === roll.values[j]
          && (
            roll.sourceKinds[left] > roll.sourceKinds[j]
            || (
              roll.sourceKinds[left] === roll.sourceKinds[j]
              && roll.maxValues[left] > roll.maxValues[j]
            )
          )
        )
      );
      if (!swap) break;

      const value = roll.values[left];
      roll.values[left] = roll.values[j];
      roll.values[j] = value;

      const maxValue = roll.maxValues[left];
      roll.maxValues[left] = roll.maxValues[j];
      roll.maxValues[j] = maxValue;

      const source = roll.sourceKinds[left];
      roll.sourceKinds[left] = roll.sourceKinds[j];
      roll.sourceKinds[j] = source;

      const slot = roll.slotIndices[left];
      roll.slotIndices[left] = roll.slotIndices[j];
      roll.slotIndices[j] = slot;

      const aurora = roll.auroraIndices[left];
      roll.auroraIndices[left] = roll.auroraIndices[j];
      roll.auroraIndices[j] = aurora;

      const hasA = roll.hasA[left];
      roll.hasA[left] = roll.hasA[j];
      roll.hasA[j] = hasA;
      j -= 1;
    }
  }
}

function findDestinyIndex(state, roll) {
  for (let i = 0; i < roll.count; i += 1) {
    if (roll.sourceKinds[i] !== SOURCE_AURORA) continue;
    const aurora = state.catalog.auroras[roll.auroraIndices[i]];
    if (aurora && aurora.id === 'destiny') return i;
  }
  return -1;
}

function rollNormalDice(state, playerIndex, roll) {
  roll.count = state.normalDiceCount[playerIndex];
  const offset = playerOffset(playerIndex);
  for (let i = 0; i < roll.count; i += 1) {
    const sides = state.diceSides[offset + i];
    roll.values[i] = nextInt(state, sides) + 1;
    roll.maxValues[i] = sides;
    roll.sourceKinds[i] = SOURCE_NORMAL;
    roll.slotIndices[i] = i;
    roll.auroraIndices[i] = -1;
    roll.hasA[i] = 0;
  }
  for (let i = roll.count; i < 6; i += 1) {
    roll.values[i] = 0;
    roll.maxValues[i] = 0;
    roll.sourceKinds[i] = SOURCE_NORMAL;
    roll.slotIndices[i] = -1;
    roll.auroraIndices[i] = -1;
    roll.hasA[i] = 0;
  }
}

function rollAuroraIntoPool(state, playerIndex, roll, roleName) {
  const auroraIndex = state.auroraIndex[playerIndex];
  const aurora = state.catalog.auroras[auroraIndex];
  const nextSlot = roll.count;
  const faceIndex = nextInt(state, aurora.faceCount);
  const value = aurora.facesValues[faceIndex];
  const hasA = aurora.facesHasA[faceIndex];
  roll.count += 1;
  roll.values[nextSlot] = value;
  roll.maxValues[nextSlot] = aurora.maxValue;
  roll.sourceKinds[nextSlot] = SOURCE_AURORA;
  roll.slotIndices[nextSlot] = -1;
  roll.auroraIndices[nextSlot] = auroraIndex;
  roll.hasA[nextSlot] = hasA;
  weatherRules.applySingleDieConstraint(state, roll, nextSlot, roleName);
  sortRoll(roll);
  return { value, hasA };
}

function rerollAttackMask(state, playerIndex, mask) {
  const roll = state.attackRoll;
  const indices = getSelectedIndices(mask);
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (roll.sourceKinds[index] === SOURCE_AURORA) {
      const aurora = state.catalog.auroras[roll.auroraIndices[index]];
      const faceIndex = nextInt(state, aurora.faceCount);
      roll.values[index] = aurora.facesValues[faceIndex];
      roll.maxValues[index] = aurora.maxValue;
      roll.hasA[index] = aurora.facesHasA[faceIndex];
    } else {
      const maxValue = roll.maxValues[index];
      roll.values[index] = nextInt(state, maxValue) + 1;
      roll.hasA[index] = 0;
    }
    weatherRules.applySingleDieConstraint(state, roll, index, 'attack');
  }
  sortRoll(roll);
}

function applyCharacterHook(state, playerIndex, hookName, ctx, runtime) {
  const behavior = getCharacterBehavior(state, playerIndex);
  if (!behavior || typeof behavior[hookName] !== 'function') return;
  behavior[hookName](state, ctx, runtime);
}

function applyAuroraSelectionEffect(state, playerIndex, opponentIndex, roll, mask, role, runtime) {
  const indices = getSelectedIndices(mask);
  let auroraPos = -1;
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i];
    if (roll.sourceKinds[index] === SOURCE_AURORA && roll.hasA[index]) {
      auroraPos = index;
      break;
    }
  }
  if (auroraPos === -1) return;

  state.auroraAEffectCount[playerIndex] += 1;
  const ctx = buildContext(runtime, playerIndex, opponentIndex, roll, mask, role);
  ctx.auroraValue = roll.values[auroraPos];
  const behavior = getAuroraBehavior(state, playerIndex);
  if (!behavior) return;
  if (role === ROLE_ATTACK && typeof behavior.onAttack === 'function') {
    behavior.onAttack(state, ctx, runtime);
  } else if (role === ROLE_DEFENSE && typeof behavior.onDefense === 'function') {
    behavior.onDefense(state, ctx, runtime);
  }
}

function applyHackEffects(state, attacker, defender, runtime) {
  if (state.hackActive[attacker] && state.defenseSelectionMask) {
    const maxIndex = findHighestSelectedNonAuroraIndex(state.defenseRoll, state.defenseSelectionMask);
    if (maxIndex !== -1 && state.defenseRoll.values[maxIndex] > 2) {
      const diff = state.defenseRoll.values[maxIndex] - 2;
      state.defenseRoll.values[maxIndex] = 2;
      state.defenseValue -= diff;
      if (runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(attacker)}的【骇入】生效，${runtime.getPlayerName(defender)}防守值-${diff}（变为${state.defenseValue}）。`);
      }
    }
  }

  if (state.hackActive[defender] && state.attackSelectionMask) {
    const maxIndex = findHighestSelectedNonAuroraIndex(state.attackRoll, state.attackSelectionMask);
    if (maxIndex !== -1 && state.attackRoll.values[maxIndex] > 2) {
      const diff = state.attackRoll.values[maxIndex] - 2;
      state.attackRoll.values[maxIndex] = 2;
      state.attackValue -= diff;
      if (runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(defender)}的【骇入】生效，${runtime.getPlayerName(attacker)}攻击值-${diff}（变为${state.attackValue}）。`);
      }
    }
  }
}

function applyThornsDamage(state, runtime) {
  for (let i = 0; i < 2; i += 1) {
    if (state.thorns[i] > 0) {
      const damage = state.thorns[i];
      runtime.damage(state, i, i, damage);
      if (runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(i)}受到${damage}层荆棘伤害。`);
      }
      state.thorns[i] = 0;
    }
  }
}

function checkGameOver(state, runtime) {
  if (state.hp[0] > 0 && state.hp[1] > 0) return false;

  state.status = STATUS_ENDED;
  state.phase = PHASE_ENDED;
  if (state.hp[0] <= 0 && state.hp[1] <= 0) {
    state.winner = state.attacker;
    if (runtime.logEnabled) runtime.log('双方同时归零，判定当前攻击方获胜。');
    return true;
  }

  state.winner = state.hp[0] <= 0 ? 1 : 0;
  if (runtime.logEnabled) {
    const loser = state.winner === 0 ? 1 : 0;
    runtime.log(`${runtime.getPlayerName(loser)}生命值归零，${runtime.getPlayerName(state.winner)}获胜。`);
  }
  return true;
}

function calcHits(state, runtime) {
  let base = state.attackValue;
  if (!state.attackPierce) {
    base = state.attackValue - state.defenseValue;
    if (base < 0) base = 0;
  }
  const hits = runtime.scratch.hits;
  hits[0] = base;
  let hitCount = 1;
  if (state.extraAttackQueued) {
    hits[1] = base;
    hitCount = 2;
  } else {
    hits[1] = 0;
  }
  return hitCount;
}

function goNextRound(state, runtime) {
  const endingAttacker = state.attacker;
  const nextAttacker = state.defender;
  const nextDefender = state.attacker;

  weatherRules.onEndCurrentRound(state, endingAttacker, runtime);

  for (let i = 0; i < 2; i += 1) {
    if (state.poison[i] > 0) {
      const source = i === 0 ? 1 : 0;
      const amount = state.poison[i];
      runtime.damage(state, source, i, amount);
      if (runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(i)}受到${amount}层中毒伤害。`);
      }
      state.poison[i] -= 1;
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const ctx = buildContext(runtime, i, i === 0 ? 1 : 0, state.attackRoll, 0, ROLE_ATTACK);
    applyCharacterHook(state, i, 'onRoundEnd', ctx, runtime);
  }

  state.round += 1;
  state.attacker = nextAttacker;
  state.defender = nextDefender;
  state.phase = PHASE_ATTACK_ROLL;
  state.rerollsLeft = 2;
  resetExchangeState(state);
  resetRoundFlags(state, nextAttacker, nextDefender);
  state.counterActive[nextAttacker] = 0;
  state.counterActive[nextDefender] = 0;
  state.yaoguangRerollsUsed[nextAttacker] = 0;
  state.yaoguangRerollsUsed[nextDefender] = 0;

  weatherRules.updateWeatherForNewRound(state, runtime);
  if (runtime.logEnabled) {
    runtime.log(`第${state.round}回合开始，攻击方：${runtime.getPlayerName(nextAttacker)}。`);
  }
}

function enumerateActions(state, outBuffer) {
  if (state.status === STATUS_ENDED || state.phase === PHASE_ENDED) return 0;
  let count = 0;

  if (state.phase === PHASE_ATTACK_ROLL) {
    outBuffer[count++] = encodeAction(OPCODES.ROLL_ATTACK, 0);
    return count;
  }

  if (state.phase === PHASE_DEFENSE_ROLL) {
    outBuffer[count++] = encodeAction(OPCODES.ROLL_DEFENSE, 0);
    return count;
  }

  if (state.phase === PHASE_ATTACK_REROLL_OR_SELECT) {
    const attacker = state.attacker;
    const useVerdict = canUseAurora(state, attacker, ROLE_ATTACK);
    if (useVerdict.ok) outBuffer[count++] = encodeAction(OPCODES.USE_AURORA_ATTACK, 0);

    if (state.rerollsLeft > 0) {
      const limit = 1 << state.attackRoll.count;
      const destiny = findDestinyIndex(state, state.attackRoll);
      for (let mask = 1; mask < limit; mask += 1) {
        if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) continue;
        outBuffer[count++] = encodeAction(OPCODES.REROLL_ATTACK, mask);
      }
    }

    const need = getNeedCount(state.attackLevel[attacker], state.attackRoll.count);
    const masks = state.catalog.maskTableByRollAndCount[state.attackRoll.count][need];
    const destiny = findDestinyIndex(state, state.attackRoll);
    for (let i = 0; i < masks.length; i += 1) {
      const mask = masks[i];
      if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) continue;
      outBuffer[count++] = encodeAction(OPCODES.CONFIRM_ATTACK, mask);
    }
    return count;
  }

  if (state.phase === PHASE_DEFENSE_SELECT) {
    const defender = state.defender;
    const useVerdict = canUseAurora(state, defender, ROLE_DEFENSE);
    if (useVerdict.ok) outBuffer[count++] = encodeAction(OPCODES.USE_AURORA_DEFENSE, 0);

    const need = getNeedCount(state.defenseLevel[defender], state.defenseRoll.count);
    const masks = state.catalog.maskTableByRollAndCount[state.defenseRoll.count][need];
    const destiny = findDestinyIndex(state, state.defenseRoll);
    for (let i = 0; i < masks.length; i += 1) {
      const mask = masks[i];
      if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) continue;
      outBuffer[count++] = encodeAction(OPCODES.CONFIRM_DEFENSE, mask);
    }
    return count;
  }

  return count;
}

function applyRollAttack(state, runtime) {
  const attacker = state.attacker;
  const defender = state.defender;
  rollNormalDice(state, attacker, state.attackRoll);
  weatherRules.applyRollConstraints(state, state.attackRoll, 'attack');
  sortRoll(state.attackRoll);

  state.rerollsLeft = state.maxAttackRerolls[attacker];
  state.rerollsLeft += weatherRules.getAttackRerollBonus(state);

  state.attackSelectionMask = 0;
  state.attackValue = VALUE_NONE;
  state.attackPierce = 0;
  state.defenseSelectionMask = 0;
  state.defenseValue = VALUE_NONE;
  state.lastDamage = VALUE_NONE;
  state.extraAttackQueued = 0;
  clearRoll(state.defenseRoll);
  resetRoundFlags(state, attacker, defender);
  state.yaoguangRerollsUsed[attacker] = 0;
  state.phase = PHASE_ATTACK_REROLL_OR_SELECT;

  if (runtime.logEnabled) {
    const parts = [];
    for (let i = 0; i < state.attackRoll.count; i += 1) {
      parts.push(state.attackRoll.hasA[i] ? `${state.attackRoll.values[i]}A` : `${state.attackRoll.values[i]}`);
    }
    runtime.log(`${runtime.getPlayerName(attacker)}投掷攻击骰：${parts.join(', ')}`);
  }
}

function clearRoll(roll) {
  roll.count = 0;
  for (let i = 0; i < 6; i += 1) {
    roll.values[i] = 0;
    roll.maxValues[i] = 0;
    roll.sourceKinds[i] = 0;
    roll.slotIndices[i] = -1;
    roll.auroraIndices[i] = -1;
    roll.hasA[i] = 0;
  }
}

function applyRollDefense(state, runtime) {
  const defender = state.defender;
  const ctx = buildContext(runtime, defender, state.attacker, state.defenseRoll, 0, ROLE_DEFENSE);
  applyCharacterHook(state, defender, 'onDefenseRoll', ctx, runtime);
  rollNormalDice(state, defender, state.defenseRoll);
  weatherRules.applyRollConstraints(state, state.defenseRoll, 'defense');
  sortRoll(state.defenseRoll);
  state.defenseSelectionMask = 0;
  state.defenseValue = VALUE_NONE;
  state.phase = PHASE_DEFENSE_SELECT;

  if (runtime.logEnabled) {
    const parts = [];
    for (let i = 0; i < state.defenseRoll.count; i += 1) {
      parts.push(state.defenseRoll.hasA[i] ? `${state.defenseRoll.values[i]}A` : `${state.defenseRoll.values[i]}`);
    }
    runtime.log(`${runtime.getPlayerName(defender)}投掷防御骰：${parts.join(', ')}`);
  }
}

function applyUseAurora(state, role, runtime) {
  const actor = role === ROLE_ATTACK ? state.attacker : state.defender;
  const opponent = actor === 0 ? 1 : 0;
  const verdict = canUseAurora(state, actor, role);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const roll = role === ROLE_ATTACK ? state.attackRoll : state.defenseRoll;
  const rolled = rollAuroraIntoPool(state, actor, roll, role === ROLE_ATTACK ? 'attack' : 'defense');
  state.auroraUsesRemaining[actor] -= 1;
  state.roundAuroraUsed[actor] = 1;
  const aurora = getAuroraRecord(state, actor);
  if (runtime.logEnabled) {
    runtime.log(`${runtime.getPlayerName(actor)}使用曜彩骰【${aurora.name}】，投出 ${rolled.hasA ? `${rolled.value}A` : `${rolled.value}`}。`);
  }
  return { ok: true, actor, opponent };
}

function applyConfirmAttack(state, mask, runtime) {
  const attacker = state.attacker;
  const defender = state.defender;
  if (mask <= 0 || mask >= (1 << state.attackRoll.count)) {
    return { ok: false, reason: 'invalid_attack_mask' };
  }
  const need = getNeedCount(state.attackLevel[attacker], state.attackRoll.count);
  if (POPCOUNT[mask] !== need) {
    return { ok: false, reason: `必须选择${need}枚不同的骰子。` };
  }
  const destiny = findDestinyIndex(state, state.attackRoll);
  if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) {
    return { ok: false, reason: '命定：曜彩骰必须被选中。' };
  }

  state.selectedFourCount[attacker] += countSelectedValue(state.attackRoll, mask, 4);
  state.selectedOneCount[attacker] += countSelectedValue(state.attackRoll, mask, 1);

  const ctx = buildContext(runtime, attacker, defender, state.attackRoll, mask, ROLE_ATTACK);
  applyAscension(state, ctx, runtime);
  applyCharacterHook(state, attacker, 'onAttackConfirm', ctx, runtime);

  state.attackSelectionMask = mask;
  state.attackValue = sumMask(state.attackRoll, mask);
  let attackBonusParts = applyGlobalAttackBonuses(state, attacker, runtime);

  applyCharacterHook(state, attacker, 'onMainAttackConfirm', ctx, runtime);
  attackBonusParts = applyGlobalAttackBonuses(state, attacker, runtime, attackBonusParts);
  applyAuroraSelectionEffect(state, attacker, defender, state.attackRoll, mask, ROLE_ATTACK, runtime);
  attackBonusParts = applyGlobalAttackBonuses(state, attacker, runtime, attackBonusParts);
  weatherRules.onAttackSelect(state, attacker, defender, state.attackRoll, mask, runtime);
  applyGlobalAttackBonuses(state, attacker, runtime, attackBonusParts);

  if (checkGameOver(state, runtime)) return { ok: true };

  state.phase = PHASE_DEFENSE_ROLL;
  if (runtime.logEnabled) runtime.log(`${runtime.getPlayerName(attacker)}确认攻击值：${state.attackValue}`);
  return { ok: true };
}

function applyConfirmDefense(state, mask, runtime) {
  const defender = state.defender;
  const attacker = state.attacker;
  if (mask <= 0 || mask >= (1 << state.defenseRoll.count)) {
    return { ok: false, reason: 'invalid_defense_mask' };
  }
  const need = getNeedCount(state.defenseLevel[defender], state.defenseRoll.count);
  if (POPCOUNT[mask] !== need) {
    return { ok: false, reason: `必须选择${need}枚不同的骰子。` };
  }
  const destiny = findDestinyIndex(state, state.defenseRoll);
  if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) {
    return { ok: false, reason: '命定：曜彩骰必须被选中。' };
  }

  state.selectedFourCount[defender] += countSelectedValue(state.defenseRoll, mask, 4);
  state.selectedOneCount[defender] += countSelectedValue(state.defenseRoll, mask, 1);

  const ctx = buildContext(runtime, defender, attacker, state.defenseRoll, mask, ROLE_DEFENSE);
  applyAscension(state, ctx, runtime);
  applyCharacterHook(state, defender, 'onDefenseConfirm', ctx, runtime);

  state.defenseSelectionMask = mask;
  state.defenseValue = sumMask(state.defenseRoll, mask);

  applyCharacterHook(state, defender, 'onMainDefenseConfirm', ctx, runtime);
  applyAuroraSelectionEffect(state, defender, attacker, state.defenseRoll, mask, ROLE_DEFENSE, runtime);
  applyHackEffects(state, attacker, defender, runtime);
  weatherRules.onDefenseSelect(state, defender, state.defenseRoll, mask, runtime);

  if (state.overload[defender] > 0) {
    const damage = Math.ceil(state.overload[defender] * 0.5);
    runtime.damage(state, defender, defender, damage);
    if (runtime.logEnabled) runtime.log(`${runtime.getPlayerName(defender)}触发【超载】防御自伤${damage}点。`);
  }

  applyThornsDamage(state, runtime);

  const hitCount = calcHits(state, runtime);
  const hits = runtime.scratch.hits;
  const hpBeforeDefender = state.hp[defender];

  for (let i = 0; i < hitCount; i += 1) {
    if (!state.attackPierce && state.forceField[defender]) hits[i] = 0;
  }

  if (state.whiteeGuardActive[defender] || state.unyielding[defender]) {
    let total = 0;
    for (let i = 0; i < hitCount; i += 1) total += hits[i];
    const maxLoss = hpBeforeDefender - 1 < 0 ? 0 : hpBeforeDefender - 1;
    if (total > maxLoss) {
      let remain = maxLoss;
      for (let i = 0; i < hitCount; i += 1) {
        const part = hits[i] > remain ? remain : hits[i];
        remain -= part;
        hits[i] = part;
      }
      if (state.unyielding[defender] && runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(defender)}的不屈生效，生命值保留至1。`);
      }
    }
  }

  let totalDamage = 0;
  for (let i = 0; i < hitCount; i += 1) totalDamage += hits[i];
  state.lastDamage = totalDamage;
  state.hp[defender] -= totalDamage;

  if (runtime.effectEnabled) {
    runtime.effect({
      type: 'damage_resolution',
      attackerIndex: attacker,
      defenderIndex: defender,
      attackValue: state.attackValue,
      defenseValue: state.defenseValue,
      hits: Array.from(hits.slice(0, hitCount)),
      forceField: !!(state.forceField[defender] && !state.attackPierce),
      hpBefore: hpBeforeDefender,
      hpAfter: state.hp[defender],
      pierce: !!state.attackPierce,
    });
  }

  if (runtime.logEnabled) {
    if (state.extraAttackQueued) {
      runtime.log(`${runtime.getPlayerName(attacker)}发动连击追加攻击，总伤害${totalDamage}。`);
    } else {
      runtime.log(`${runtime.getPlayerName(attacker)}攻击${runtime.getPlayerName(defender)}，攻击值${state.attackValue}，防御值${state.defenseValue}，造成${totalDamage}点伤害。`);
    }
  }

  if (totalDamage > 0) state.cumulativeDamageTaken[defender] += totalDamage;

  ctx.totalDamage = totalDamage;
  ctx.hitCount = hitCount;
  for (let i = 0; i < hitCount; i += 1) ctx.hits[i] = hits[i];

  applyCharacterHook(state, defender, 'onDamageApplied', ctx, runtime);

  const attackCtx = buildContext(runtime, attacker, defender, state.attackRoll, state.attackSelectionMask, ROLE_ATTACK);
  attackCtx.totalDamage = totalDamage;
  attackCtx.attackValue = state.attackValue;
  attackCtx.defenseValue = state.defenseValue;
  applyCharacterHook(state, attacker, 'onAttackAfterDamageResolved', attackCtx, runtime);

  const defendCtx = buildContext(runtime, defender, attacker, state.defenseRoll, state.defenseSelectionMask, ROLE_DEFENSE);
  defendCtx.totalDamage = totalDamage;
  defendCtx.attackValue = state.attackValue;
  defendCtx.defenseValue = state.defenseValue;
  defendCtx.hitCount = hitCount;
  for (let i = 0; i < hitCount; i += 1) defendCtx.hits[i] = hits[i];
  applyCharacterHook(state, defender, 'onAfterDamageResolved', defendCtx, runtime);

  weatherRules.onAfterDamageResolved(state, attacker, defender, state.attackRoll, state.attackSelectionMask, totalDamage, runtime);

  if (state.counterActive[defender]) {
    state.counterActive[defender] = 0;
    if (!state.attackPierce && state.defenseValue > state.attackValue) {
      const counterDamage = state.defenseValue - state.attackValue;
      runtime.damage(state, defender, attacker, counterDamage);
      if (runtime.logEnabled) {
        runtime.log(`${runtime.getPlayerName(defender)}触发【反击】，对${runtime.getPlayerName(attacker)}造成${counterDamage}点反击伤害！`);
      }
    }
  }

  if (checkGameOver(state, runtime)) return { ok: true };
  goNextRound(state, runtime);
  checkGameOver(state, runtime);
  return { ok: true };
}

function applyActionInPlace(state, action, runtime = DEFAULT_RUNTIME) {
  if (state.status === STATUS_ENDED) {
    return { ok: false, reason: 'battle_ended', phase: PHASE_NAMES[state.phase] };
  }

  const opcode = getActionOpcode(action);
  const mask = getActionMask(action);
  let result;

  if (opcode === OPCODES.ROLL_ATTACK && state.phase === PHASE_ATTACK_ROLL) {
    applyRollAttack(state, runtime);
    result = { ok: true };
  } else if (opcode === OPCODES.USE_AURORA_ATTACK && state.phase === PHASE_ATTACK_REROLL_OR_SELECT) {
    result = applyUseAurora(state, ROLE_ATTACK, runtime);
  } else if (opcode === OPCODES.REROLL_ATTACK && state.phase === PHASE_ATTACK_REROLL_OR_SELECT) {
    if (state.rerollsLeft <= 0) {
      result = { ok: false, reason: '没有剩余重投次数。' };
    } else if (mask <= 0 || mask >= (1 << state.attackRoll.count)) {
      result = { ok: false, reason: '重投参数无效。' };
    } else {
      const destiny = findDestinyIndex(state, state.attackRoll);
      if (destiny !== -1 && ((mask >>> destiny) & 1) === 0) {
        result = { ok: false, reason: '命定：重投时必须包含命定曜彩骰。' };
      } else {
        rerollAttackMask(state, state.attacker, mask);
        state.rerollsLeft -= 1;
        weatherRules.onAttackReroll(state, state.attacker, runtime);
        const ctx = buildContext(runtime, state.attacker, state.defender, state.attackRoll, mask, ROLE_ATTACK);
        applyCharacterHook(state, state.attacker, 'onReroll', ctx, runtime);
        if (runtime.logEnabled) {
          const parts = [];
          for (let i = 0; i < state.attackRoll.count; i += 1) {
            parts.push(state.attackRoll.hasA[i] ? `${state.attackRoll.values[i]}A` : `${state.attackRoll.values[i]}`);
          }
          runtime.log(`${runtime.getPlayerName(state.attacker)}重投${POPCOUNT[mask]}枚攻击骰，结果：${parts.join(', ')}（剩余重投${state.rerollsLeft}次）`);
        }
        result = { ok: true };
      }
    }
  } else if (opcode === OPCODES.CONFIRM_ATTACK && state.phase === PHASE_ATTACK_REROLL_OR_SELECT) {
    result = applyConfirmAttack(state, mask, runtime);
  } else if (opcode === OPCODES.ROLL_DEFENSE && state.phase === PHASE_DEFENSE_ROLL) {
    applyRollDefense(state, runtime);
    result = { ok: true };
  } else if (opcode === OPCODES.USE_AURORA_DEFENSE && state.phase === PHASE_DEFENSE_SELECT) {
    result = applyUseAurora(state, ROLE_DEFENSE, runtime);
  } else if (opcode === OPCODES.CONFIRM_DEFENSE && state.phase === PHASE_DEFENSE_SELECT) {
    result = applyConfirmDefense(state, mask, runtime);
  } else {
    result = { ok: false, reason: 'invalid_action' };
  }

  return {
    ...result,
    phase: PHASE_NAMES[state.phase],
    status: state.status === STATUS_ENDED ? 'ended' : 'in_game',
    winner: state.winner,
    weatherChangedRound: state.weatherChangedRound,
  };
}

function isTerminal(state) {
  return state.status === STATUS_ENDED || state.phase === PHASE_ENDED;
}

module.exports = {
  enumerateActions,
  applyActionInPlace,
  isTerminal,
  canUseAurora,
};
