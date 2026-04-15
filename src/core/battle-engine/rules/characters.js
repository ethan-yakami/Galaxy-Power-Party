const {
  playerOffset,
  areAllSame,
  areAllValues,
  areAllEven,
  hasDuplicates,
  countPairs,
  countDistinctPairedValues,
  countUniqueValues,
  countOddValues,
  upgradeSide,
  findMinSelectedNormalIndices,
  sumMask,
} = require('./helpers');
const { nextInt } = require('../rng');

function playerName(runtime, playerIndex) {
  return runtime.getPlayerName(playerIndex);
}

function shouldAscend(state, actor) {
  const behaviorKey = state.catalog.characters[state.characterIndex[actor]].behaviorKey;
  if (behaviorKey === 'daheita') return state.auroraAEffectCount[actor] >= 4;
  if (behaviorKey === 'xilian') return !!state.xilianAscensionActive[actor];
  return false;
}

function applyAscension(state, ctx, runtime) {
  if (!shouldAscend(state, ctx.actor)) return;
  const minCandidates = findMinSelectedNormalIndices(ctx.roll, ctx.mask);
  if (!minCandidates.length) return;
  const minIndex = minCandidates[nextInt(state, minCandidates.length)];
  if (minIndex === -1) return;
  ctx.roll.values[minIndex] = ctx.roll.maxValues[minIndex];
  if (runtime.logEnabled) {
    runtime.log(`${playerName(runtime, ctx.actor)}触发【跃升】，将最小点骰子提升到最大值${ctx.roll.maxValues[minIndex]}。`);
  }
}

const CHARACTER_RULES = {
  baie: {
    onDefenseConfirm(state, ctx, runtime) {
      if (!state.whiteeGuardUsed[ctx.actor] && areAllSame(ctx.roll, ctx.mask)) {
        state.whiteeGuardActive[ctx.actor] = 1;
        state.whiteeGuardUsed[ctx.actor] = 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【白厄】守护，本回合生命最低保留至1（本局限1次）。`);
        }
      }
    },
    onAttackAfterDamageResolved(state, ctx, runtime) {
      if (ctx.totalDamage <= 0) return;
      const heal = Math.floor(ctx.totalDamage * 0.5);
      const real = runtime.heal(state, ctx.actor, heal);
      if (real > 0 && runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【白厄】吸收，回复${real}点生命。`);
      }
    },
  },
  daheita: {
    onRoundEnd(state, ctx, runtime) {
      state.auroraUsesRemaining[ctx.actor] += 1;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【大黑塔】回合结束效果，曜彩骰次数+1。`);
      }
    },
  },
  danheng: {
    onMainAttackConfirm(state, ctx, runtime) {
      if (state.attackValue >= 18) {
        state.danhengCounterReady[ctx.actor] = 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}攻击值>=18，下次防御将获得反击！`);
        }
      }
    },
    onDefenseRoll(state, ctx, runtime) {
      if (state.danhengCounterReady[ctx.actor]) {
        state.defenseLevel[ctx.actor] += 3;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【反击】准备，防御等级+3。`);
        }
      }
    },
    onAfterDamageResolved(state, ctx, runtime) {
      if (!state.danhengCounterReady[ctx.actor]) return;
      state.defenseLevel[ctx.actor] -= 3;
      state.danhengCounterReady[ctx.actor] = 0;
      if (!state.attackPierce && state.defenseValue > state.attackValue) {
        const counterDamage = state.defenseValue - state.attackValue;
        runtime.damage(state, ctx.actor, ctx.opponent, counterDamage);
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【反击】，对${playerName(runtime, ctx.opponent)}造成${counterDamage}点反击伤害！`);
        }
      }
    },
  },
  fengjin: {
    onAttackAfterDamageResolved(state, ctx, runtime) {
      const resolvedAttackValue = Number.isFinite(ctx.attackValue) && ctx.attackValue >= 0
        ? ctx.attackValue
        : state.attackValue;
      if (areAllValues(ctx.roll, ctx.mask, 6)) {
        state.power[ctx.actor] += resolvedAttackValue;
        const healed = runtime.heal(state, ctx.actor, 6);
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}六六触发，力量累积${state.attackValue}（当前${state.power[ctx.actor]}层），治疗${healed}点。`);
        }
        return;
      }
      const add = Math.floor(resolvedAttackValue * 0.5);
      state.power[ctx.actor] += add;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}力量累积+${add}（当前${state.power[ctx.actor]}层）。`);
      }
    },
  },
  huangquan: {
    onAttackConfirm(state, ctx, runtime) {
      if (areAllValues(ctx.roll, ctx.mask, 4)) {
        state.attackPierce = 1;
        state.attackLevel[ctx.actor] += 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【洞穿】！本次攻击无视防御与力场，并且攻击等级+1。`);
        }
      }
    },
  },
  huohua: {
    onAttackConfirm(state, ctx, runtime) {
      if (hasDuplicates(ctx.roll, ctx.mask)) {
        state.hackActive[ctx.actor] = 1;
        if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【骇入】！`);
      }
    },
    onDefenseConfirm(state, ctx, runtime) {
      if (hasDuplicates(ctx.roll, ctx.mask)) {
        state.hackActive[ctx.actor] = 1;
        if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【骇入】！`);
      }
    },
  },
  kafuka: {
    onAttackConfirm(state, ctx, runtime) {
      const uniq = countUniqueValues(ctx.roll, ctx.mask);
      if (uniq <= 0) return;
      state.poison[ctx.opponent] += uniq;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【中毒】，使${playerName(runtime, ctx.opponent)}陷入${uniq}层中毒（当前${state.poison[ctx.opponent]}层）。`);
      }
    },
    onAfterDamageResolved(state, ctx, runtime) {
      if (ctx.totalDamage > 0 && state.poison[ctx.opponent] > 0) {
        state.poison[ctx.opponent] -= 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}防御受伤，移除${playerName(runtime, ctx.opponent)}1层中毒（剩余${state.poison[ctx.opponent]}层）。`);
        }
      }
    },
  },
  liuying: {
    onAttackConfirm(state, ctx, runtime) {
      if (countDistinctPairedValues(ctx.roll, ctx.mask) >= 2) {
        state.extraAttackQueued = 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【连击】！本轮将进行两次攻击。`);
        }
      }
    },
    onMainAttackConfirm(state, ctx, runtime) {
      if (state.hp[ctx.actor] === state.maxHp[ctx.actor]) {
        state.attackValue += 5;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}满生命值，攻击值+5（当前${state.attackValue}）。`);
        }
      }
    },
  },
  sanyueqi: {
    onMainAttackConfirm(state, ctx, runtime) {
      const pairs = countPairs(ctx.roll, ctx.mask);
      if (pairs <= 0) return;
      const damage = pairs * 3;
      runtime.damage(state, ctx.actor, ctx.opponent, damage);
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【三月七】，${pairs}组相同点数对，造成${damage}点瞬伤。`);
      }
    },
    onDefenseConfirm(state, ctx, runtime) {
      const pairs = countPairs(ctx.roll, ctx.mask);
      if (pairs <= 0) return;
      const damage = pairs * 3;
      runtime.damage(state, ctx.actor, ctx.opponent, damage);
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【三月七】防御，${pairs}组相同点数对，造成${damage}点瞬伤。`);
      }
    },
  },
  shajin: {
    onAttackConfirm(state, ctx, runtime) {
      const odds = countOddValues(ctx.roll, ctx.mask);
      if (odds > 0) {
        state.resilience[ctx.actor] += odds;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}获得${odds}层韧性（当前${state.resilience[ctx.actor]}层）。`);
        }
      }
      while (state.resilience[ctx.actor] >= 7) {
        state.resilience[ctx.actor] -= 7;
        runtime.damage(state, ctx.actor, ctx.opponent, 7);
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}韧性满7层，对${playerName(runtime, ctx.opponent)}造成7点瞬伤！（剩余${state.resilience[ctx.actor]}层）`);
        }
      }
    },
    onMainDefenseConfirm(state, ctx, runtime) {
      if (state.resilience[ctx.actor] > 0) {
        state.defenseValue += state.resilience[ctx.actor];
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【韧性】防御加成${state.resilience[ctx.actor]}，防御值${state.defenseValue}。`);
        }
      }
    },
  },
  xiadie: {
    onDamageApplied(state, ctx, runtime) {
      for (let i = 0; i < ctx.hitCount; i += 1) {
        const hit = ctx.hits[i];
        if (hit >= 8) {
          state.attackLevel[ctx.actor] += 1;
          state.defenseLevel[ctx.actor] += 1;
          if (runtime.logEnabled) {
            runtime.log(`${playerName(runtime, ctx.actor)}触发【遐蝶】防御成长：单次伤害>=8，攻防等级+1。`);
          }
        }
        if (hit > 0 && hit <= 5) {
          runtime.damage(state, ctx.actor, ctx.opponent, 3);
          if (runtime.logEnabled) {
            runtime.log(`${playerName(runtime, ctx.actor)}触发【遐蝶】瞬伤，对${playerName(runtime, ctx.opponent)}造成3点无视轮次伤害。`);
          }
        }
      }
    },
  },
  xilian: {
    onMainAttackConfirm(state, ctx, runtime) {
      state.xilianCumulative[ctx.actor] += sumMask(ctx.roll, ctx.mask);
      if (!state.xilianAscensionActive[ctx.actor] && state.xilianCumulative[ctx.actor] > 24) {
        state.xilianAscensionActive[ctx.actor] = 1;
        state.attackLevel[ctx.actor] = 5;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}累计攻防值超过24，攻击等级变为5，此后每回合获得跃升。`);
        }
      }
    },
    onMainDefenseConfirm(state, ctx, runtime) {
      state.xilianCumulative[ctx.actor] += state.defenseValue;
      if (!state.xilianAscensionActive[ctx.actor] && state.xilianCumulative[ctx.actor] > 24) {
        state.xilianAscensionActive[ctx.actor] = 1;
        state.attackLevel[ctx.actor] = 5;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}累计攻防值超过24，攻击等级变为5，此后每回合获得跃升。`);
        }
      }
    },
  },
  yaoguang: {
    onReroll(state, ctx, runtime) {
      state.yaoguangRerollsUsed[ctx.actor] += 1;
      if (state.yaoguangRerollsUsed[ctx.actor] > 2) {
        state.thorns[ctx.actor] += 2;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}超过2次重投，获得2层荆棘（当前${state.thorns[ctx.actor]}层）。`);
        }
      }
    },
    onMainAttackConfirm(state, ctx, runtime) {
      if (state.attackValue >= 18) {
        if (state.thorns[ctx.actor] > 0 && runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}攻击值>=18，移除全部${state.thorns[ctx.actor]}层荆棘。`);
        }
        state.thorns[ctx.actor] = 0;
        state.auroraUsesRemaining[ctx.actor] += 1;
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}获得1次曜彩骰使用次数。`);
        }
      }
    },
  },
  zhigengniao: {
    onAttackConfirm(state, ctx, runtime) {
      if (!areAllEven(ctx.roll, ctx.mask)) return;
      const base = playerOffset(ctx.actor);
      let upgraded = 0;
      const indices = ctx.selectedIndices;
      for (let i = 0; i < indices.length; i += 1) {
        const index = indices[i];
        if (ctx.roll.sourceKinds[index] !== 0) continue;
        const slotIndex = ctx.roll.slotIndices[index];
        if (slotIndex < 0) continue;
        const fullIndex = base + slotIndex;
        const oldSide = state.diceSides[fullIndex];
        const next = upgradeSide(oldSide);
        if (next !== oldSide) {
          state.diceSides[fullIndex] = next;
          upgraded += 1;
        }
      }
      if (upgraded > 0 && runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【升级】效果，${upgraded}枚骰子面数提升。`);
      }
    },
  },
};

module.exports = {
  CHARACTER_RULES,
  shouldAscend,
  applyAscension,
};
