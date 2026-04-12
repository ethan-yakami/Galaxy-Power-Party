function playerName(runtime, playerIndex) {
  return runtime.getPlayerName(playerIndex);
}

const OK = { ok: true, reason: '' };

const AURORA_RULES = {
  berserker: {
    onAttack(state, ctx, runtime) {
      const layers = Math.floor(ctx.auroraValue / 4);
      state.thorns[ctx.actor] += layers;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【战狂】A效果，获得${layers}层荆棘（当前${state.thorns[ctx.actor]}层）。`);
      }
    },
    onDefense(state, ctx, runtime) {
      const layers = Math.floor(ctx.auroraValue / 4);
      state.thorns[ctx.actor] += layers;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【战狂】A效果，获得${layers}层荆棘（当前${state.thorns[ctx.actor]}层）。`);
      }
    },
  },
  bigredbutton: {
    canUse(state, ctx) {
      if (ctx.role !== 'attack') return { ok: false, reason: '大红按钮只能在攻击时使用。' };
      if (state.round < 5) return { ok: false, reason: '大红按钮需要回合数>=5。' };
      return OK;
    },
    onAttack(state, ctx, runtime) {
      const before = state.hp[ctx.actor];
      const lost = before - 1;
      if (lost > 0) {
        state.hp[ctx.actor] = 1;
        state.desperateBonus[ctx.actor] += lost;
        if (runtime.effectEnabled) {
          runtime.effect({
            type: 'instant_damage',
            sourcePlayerIndex: ctx.actor,
            targetPlayerIndex: ctx.actor,
            amount: lost,
            hpBefore: before,
            hpAfter: 1,
          });
        }
        if (runtime.logEnabled) {
          runtime.log(`${playerName(runtime, ctx.actor)}触发【大红按钮】A效果，背水！生命值降为1，攻击值记录${lost}。`);
        }
        return;
      }
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【大红按钮】A效果，但生命值已为1。`);
      }
    },
  },
  cactus: {
    canUse(state, ctx) {
      if (ctx.role !== 'defense') return { ok: false, reason: '仙人球只能在防御时使用。' };
      return OK;
    },
    onDefense(state, ctx, runtime) {
      state.counterActive[ctx.actor] = 1;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【仙人球】A效果，本回合获得反击。`);
      }
    },
  },
  destiny: {
    onAttack(state, ctx, runtime) {
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
      }
    },
    onDefense(state, ctx, runtime) {
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
      }
    },
  },
  evolution: {
    onAttack(state, ctx, runtime) {
      state.attackValue *= 2;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【进化】A效果，攻击值翻倍为${state.attackValue}。`);
      }
    },
    onDefense(state, ctx, runtime) {
      state.defenseValue *= 2;
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【进化】A效果，防御值翻倍为${state.defenseValue}。`);
      }
    },
  },
  gambler: {
    canUse(state) {
      if (state.round > 4) return { ok: false, reason: '赌徒仅能在前4回合内使用。' };
      return OK;
    },
  },
  heartbeat: {
    onAttack(state, ctx, runtime) {
      state.auroraUsesRemaining[ctx.actor] += 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
    },
    onDefense(state, ctx, runtime) {
      state.auroraUsesRemaining[ctx.actor] += 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
    },
  },
  legacy: {
    canUse(state, ctx) {
      if (state.hp[ctx.actor] > 8) return { ok: false, reason: '遗语仅在生命值<=8时可用。' };
      return OK;
    },
    onAttack(state, ctx, runtime) {
      state.attackValue *= 2;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【遗语】A效果，攻击值翻倍为${state.attackValue}。`);
    },
    onDefense(state, ctx, runtime) {
      state.defenseValue *= 2;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【遗语】A效果，防守值翻倍为${state.defenseValue}。`);
    },
  },
  loan: {
    onAttack(state, ctx, runtime) {
      state.overload[ctx.actor] += ctx.auroraValue;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【贷款】A效果，获得${ctx.auroraValue}层超载（当前${state.overload[ctx.actor]}层）。`);
    },
    onDefense(state, ctx, runtime) {
      state.overload[ctx.actor] += ctx.auroraValue;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【贷款】A效果，获得${ctx.auroraValue}层超载（当前${state.overload[ctx.actor]}层）。`);
    },
  },
  magicbullet: {
    onAttack(state, ctx, runtime) {
      runtime.damage(state, ctx.actor, ctx.opponent, 3);
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【魔弹】A效果，对${playerName(runtime, ctx.opponent)}造成3点瞬伤。`);
    },
    onDefense(state, ctx, runtime) {
      runtime.damage(state, ctx.actor, ctx.opponent, 3);
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【魔弹】A效果，对${playerName(runtime, ctx.opponent)}造成3点瞬伤。`);
    },
  },
  medic: {
    onAttack(state, ctx, runtime) {
      const healed = runtime.heal(state, ctx.actor, ctx.auroraValue);
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【医嘱】A效果，回复${healed}点生命。`);
      }
    },
    onDefense(state, ctx, runtime) {
      const healed = runtime.heal(state, ctx.actor, ctx.auroraValue);
      if (runtime.logEnabled) {
        runtime.log(`${playerName(runtime, ctx.actor)}触发【医嘱】A效果，回复${healed}点生命。`);
      }
    },
  },
  miracle: {
    canUse(state, ctx) {
      if (ctx.role !== 'attack') return { ok: false, reason: '奇迹只能在攻击时使用。' };
      if (state.selectedOneCount[ctx.actor] < 9) return { ok: false, reason: '奇迹需要累计选择9次骰面1。' };
      return OK;
    },
  },
  oath: {
    canUse(state, ctx) {
      if (ctx.role !== 'defense') return { ok: false, reason: '誓言只能在防御时使用。' };
      return OK;
    },
    onDefense(state, ctx, runtime) {
      state.unyielding[ctx.actor] = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【誓言】A效果，本回合获得不屈（生命值不会降至0以下）。`);
    },
  },
  repeater: {
    canUse(state, ctx) {
      if (ctx.role !== 'attack') return { ok: false, reason: '复读只能在攻击时使用。' };
      if (state.selectedFourCount[ctx.actor] < 2) return { ok: false, reason: '复读需要累计选择两次点数4。' };
      return OK;
    },
    onAttack(state, ctx, runtime) {
      state.extraAttackQueued = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【复读】A效果，本轮将额外进行一次攻击。`);
    },
    onDefense(state, ctx, runtime) {
      // Kept intentionally for hook-shape parity with the legacy engine.
      // canUse currently forbids defense-side activation.
      state.extraAttackQueued = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【复读】A效果，本轮将额外进行一次攻击。`);
    },
  },
  revenge: {
    canUse(state, ctx) {
      if (ctx.role !== 'attack') return { ok: false, reason: '复仇只能在攻击时使用。' };
      if (state.cumulativeDamageTaken[ctx.actor] < 25) return { ok: false, reason: '复仇需要累计受到25点伤害。' };
      return OK;
    },
  },
  starshield: {
    canUse(state, ctx) {
      if (ctx.role !== 'defense') return { ok: false, reason: '星盾只能在防守时使用。' };
      return OK;
    },
    onAttack(state, ctx, runtime) {
      // Kept intentionally for hook-shape parity with the legacy engine.
      // canUse currently forbids attack-side activation.
      state.forceField[ctx.actor] = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【星盾】A效果，本轮获得力场。`);
    },
    onDefense(state, ctx, runtime) {
      state.forceField[ctx.actor] = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【星盾】A效果，本轮获得力场。`);
    },
  },
  trickster: {
    onAttack(state, ctx, runtime) {
      state.hackActive[ctx.actor] = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【奇术师】A效果，本回合获得骇入。`);
    },
    onDefense(state, ctx, runtime) {
      state.hackActive[ctx.actor] = 1;
      if (runtime.logEnabled) runtime.log(`${playerName(runtime, ctx.actor)}触发【奇术师】A效果，本回合获得骇入。`);
    },
  },
};

function canUseAuroraRule(rule, state, ctx) {
  if (!rule || typeof rule.canUse !== 'function') return OK;
  const result = rule.canUse(state, ctx);
  return result || OK;
}

module.exports = {
  AURORA_RULES,
  canUseAuroraRule,
  OK,
};
