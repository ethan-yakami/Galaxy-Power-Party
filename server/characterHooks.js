const { getPlayerById, pushEffectEvent } = require('./rooms');
const {
  areAllValues,
  areAllEven,
  hasDuplicates,
  countDistinctPairedValues,
  countUniqueValues,
  countOddValues,
  upgradeSide,
  areAllSame,
  countPairs,
} = require('./dice');

const CharacterHooks = {
  registry: {},

  register(characterId, hooks) {
    this.registry[characterId] = hooks;
  },

  trigger(eventName, game, player, ...args) {
    if (!player || !player.characterId) return null;
    const hooks = this.registry[player.characterId];
    if (hooks && typeof hooks[eventName] === 'function') {
      return hooks[eventName](game, player, ...args);
    }
    return null;
  },

  aiScoreAttackCombo(characterId, dice, indices, game, playerId) {
    const hooks = this.registry[characterId];
    if (hooks && typeof hooks.aiScoreAttackCombo === 'function') {
      return hooks.aiScoreAttackCombo(dice, indices, game, playerId);
    }
    return 0;
  },

  aiScoreDefenseCombo(characterId, dice, indices, game, playerId) {
    const hooks = this.registry[characterId];
    if (hooks && typeof hooks.aiScoreDefenseCombo === 'function') {
      return hooks.aiScoreDefenseCombo(dice, indices, game, playerId);
    }
    return 0;
  },
  
  aiFilterReroll(characterId, dice, game, playerId) {
    const hooks = this.registry[characterId];
    if (hooks && typeof hooks.aiFilterReroll === 'function') {
      return hooks.aiFilterReroll(dice, game, playerId);
    }
    return null;
  }
};

// ======================
// Register Characters
// ======================

CharacterHooks.register('huangquan', {
  onAttackConfirm(game, attacker, selectedDice) {
    if (areAllValues(selectedDice, 4)) {
      game.attackPierce = true;
      game.attackLevel[attacker.id] += 1;
      game.log.push(`${attacker.name}触发【洞穿】！本次攻击无视防御与力场，并且攻击等级+1。`);
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    if (selected.every((d) => d.value === 4)) return 50;
    return 0;
  },
  aiFilterReroll(dice, game, playerId) {
    const needCount = game.attackLevel[playerId];
    const foursCount = dice.filter((d) => !d.isAurora && d.value === 4).length;
    if (foursCount >= needCount - 1) {
      const toReroll = [];
      for (let i = 0; i < dice.length; i++) {
        if (!dice[i].isAurora && dice[i].value !== 4) toReroll.push(i);
      }
      if (toReroll.length > 0 && toReroll.length <= 3) return toReroll;
    }
    return null;
  }
});

CharacterHooks.register('zhigengniao', {
  onAttackConfirm(game, attacker, selectedDice) {
    if (areAllEven(selectedDice)) {
      let upgraded = 0;
      for (const die of selectedDice) {
        if (die.isAurora || die.slotId === null || die.slotId === undefined) continue;
        const oldSide = game.diceSidesByPlayer[attacker.id][die.slotId];
        const next = upgradeSide(oldSide);
        if (next !== oldSide) {
          game.diceSidesByPlayer[attacker.id][die.slotId] = next;
          upgraded += 1;
        }
      }
      if (upgraded > 0) {
        game.log.push(`${attacker.name}触发【升级】效果，${upgraded}枚骰子面数提升。`);
      }
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    if (selected.every((d) => d.value % 2 === 0)) return 8;
    return 0;
  },
  aiFilterReroll(dice) {
    const oddNonAurora = [];
    for (let i = 0; i < dice.length; i++) {
      if (!dice[i].isAurora && dice[i].value % 2 !== 0) oddNonAurora.push(i);
    }
    if (oddNonAurora.length > 0 && oddNonAurora.length <= 3) return oddNonAurora;
    return null;
  }
});

CharacterHooks.register('liuying', {
  onMainAttackConfirm(game, attacker) { // Hook for after attack value is calculated
    if (game.hp[attacker.id] === game.maxHp[attacker.id]) {
      game.attackValue += 5;
      game.log.push(`${attacker.name}满生命值，攻击值+5（当前${game.attackValue}）。`);
    }
  },
  onAttackConfirm(game, attacker, selectedDice) {
    if (countDistinctPairedValues(selectedDice) >= 2) {
      game.extraAttackQueued = true;
      game.log.push(`${attacker.name}触发【连击】！本轮将进行两次攻击。`);
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    const freq = {};
    for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
    let pairedValues = 0;
    for (const v of Object.values(freq)) if (v >= 2) pairedValues++;
    if (pairedValues >= 2) return 15;
    return 0;
  }
});

CharacterHooks.register('kafuka', {
  onAttackConfirm(game, attacker, selectedDice, room) {
    const defender = getPlayerById(room, game.defenderId);
    const uniq = countUniqueValues(selectedDice);
    if (uniq > 0) {
      game.poison[defender.id] += uniq;
      game.log.push(`${attacker.name}触发【中毒】，使${defender.name}陷入${uniq}层中毒（当前${game.poison[defender.id]}层）。`);
    }
  },
  onAfterDamageResolved(game, defender, attacker, totalDamage) {
    if (totalDamage > 0 && game.poison[attacker.id] > 0) {
      game.poison[attacker.id] -= 1;
      game.log.push(`${defender.name}防御受伤，移除${attacker.name}1层中毒（剩余${game.poison[attacker.id]}层）。`);
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    return new Set(selected.map((d) => d.value)).size * 2;
  }
});

CharacterHooks.register('shajin', {
  onAttackConfirm(game, attacker, selectedDice, room) {
    const odds = countOddValues(selectedDice);
    if (odds > 0) {
      game.resilience[attacker.id] += odds;
      game.log.push(`${attacker.name}获得${odds}层韧性（当前${game.resilience[attacker.id]}层）。`);
    }
    while (game.resilience[attacker.id] >= 7) {
      game.resilience[attacker.id] -= 7;
      const target = getPlayerById(room, game.defenderId);
      const before = game.hp[target.id];
      game.hp[target.id] -= 7;
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: attacker.id,
        targetPlayerId: target.id,
        amount: 7,
        hpBefore: before,
        hpAfter: game.hp[target.id],
      });
      game.log.push(`${attacker.name}韧性满7层，对${target.name}造成7点瞬伤！（剩余${game.resilience[attacker.id]}层）`);
    }
  },
  onMainDefenseConfirm(game, defender) {
    if (game.resilience[defender.id] > 0) {
      game.defenseValue += game.resilience[defender.id];
      game.log.push(`${defender.name}触发【韧性】防御加成+${game.resilience[defender.id]}，防守值${game.defenseValue}。`);
    }
  },
  aiScoreAttackCombo(dice, indices, game, playerId) {
    const selected = indices.map((i) => dice[i]);
    const odds = selected.filter((d) => d.value % 2 !== 0).length;
    let score = odds * 1.5;
    if (game && game.resilience) {
      const cur = game.resilience[playerId] || 0;
      if (cur + odds >= 7) score += 10;
    }
    return score;
  }
});

CharacterHooks.register('huohua', {
  onAttackConfirm(game, attacker, selectedDice) {
    if (hasDuplicates(selectedDice)) {
      game.hackActive[attacker.id] = true;
      game.log.push(`${attacker.name}触发【骇入】！`);
    }
  },
  onDefenseConfirm(game, defender, selectedDice) {
    if (hasDuplicates(selectedDice)) {
      game.hackActive[defender.id] = true;
      game.log.push(`${defender.name}触发【骇入】！`);
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    const seen = new Set();
    for (const d of selected) {
      if (seen.has(d.value)) return 8;
      seen.add(d.value);
    }
    return 0;
  },
  aiScoreDefenseCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    const seen = new Set();
    for (const d of selected) {
      if (seen.has(d.value)) return 8;
      seen.add(d.value);
    }
    return 0;
  }
});

CharacterHooks.register('sanyueqi', {
  onMainAttackConfirm(game, attacker, selectedDice, room) {
    const pairs = countPairs(selectedDice);
    if (pairs > 0) {
      const target = getPlayerById(room, game.defenderId);
      const dmg = pairs * 3;
      const before = game.hp[target.id];
      game.hp[target.id] -= dmg;
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: attacker.id,
        targetPlayerId: target.id,
        amount: dmg,
        hpBefore: before,
        hpAfter: game.hp[target.id],
      });
      game.log.push(`${attacker.name}触发【三月七】，${pairs}组相同点数对，造成${dmg}点瞬伤。`);
    }
  },
  onDefenseConfirm(game, defender, selectedDice, room) {
    const pairs = countPairs(selectedDice);
    if (pairs > 0) {
      const attacker = getPlayerById(room, game.attackerId);
      const dmg = pairs * 3;
      const before = game.hp[attacker.id];
      game.hp[attacker.id] -= dmg;
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: defender.id,
        targetPlayerId: attacker.id,
        amount: dmg,
        hpBefore: before,
        hpAfter: game.hp[attacker.id],
      });
      game.log.push(`${defender.name}触发【三月七】防御，${pairs}组相同点数对，造成${dmg}点瞬伤。`);
    }
  },
  aiScoreAttackCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    const freq = {};
    for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
    let pairs = 0;
    for (const v of Object.values(freq)) pairs += Math.floor(v / 2);
    return pairs * 4;
  },
  aiScoreDefenseCombo(dice, indices) {
    const selected = indices.map((i) => dice[i]);
    const freq = {};
    for (const d of selected) freq[d.value] = (freq[d.value] || 0) + 1;
    let pairs = 0;
    for (const v of Object.values(freq)) pairs += Math.floor(v / 2);
    return pairs * 4;
  }
});

CharacterHooks.register('fengjin', {
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
      const before = game.hp[attacker.id];
      const healAmt = Math.min(6, game.maxHp[attacker.id] - before);
      if (healAmt > 0) {
        game.hp[attacker.id] += healAmt;
        pushEffectEvent(game, {
          type: 'heal',
          playerId: attacker.id,
          amount: healAmt,
          hpBefore: before,
          hpAfter: game.hp[attacker.id],
        });
      }
      game.log.push(`${attacker.name}全6触发，力量累积100%（当前${game.power[attacker.id]}层），治疗${healAmt > 0 ? healAmt : 0}点。`);
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
  }
});

CharacterHooks.register('danheng', {
  onMainAttackConfirm(game, attacker) {
    if (game.attackValue >= 18) {
      game.danhengCounterReady[attacker.id] = true;
      game.log.push(`${attacker.name}攻击值>=18，下次防御将获得反击！`);
    }
  },
  onDefenseRoll(game, defender) {
    if (game.danhengCounterReady[defender.id]) {
      game.defenseLevel[defender.id] += 3;
      game.log.push(`${defender.name}触发【反击】准备，防御等级+3。`);
    }
  },
  onAfterDamageResolved(game, defender, attacker) {
    if (game.danhengCounterReady[defender.id]) {
      game.defenseLevel[defender.id] -= 3;
      game.danhengCounterReady[defender.id] = false;
      if (!game.attackPierce && game.defenseValue > game.attackValue) {
        const counterDmg = game.defenseValue - game.attackValue;
        const before = game.hp[attacker.id];
        game.hp[attacker.id] -= counterDmg;
        pushEffectEvent(game, {
          type: 'instant_damage',
          sourcePlayerId: defender.id,
          targetPlayerId: attacker.id,
          amount: counterDmg,
          hpBefore: before,
          hpAfter: game.hp[attacker.id],
        });
        game.log.push(`${defender.name}触发【反击】，对${attacker.name}造成${counterDmg}点反击伤害！`);
      }
    }
  }
});

CharacterHooks.register('yaoguang', {
  onMainAttackConfirm(game, attacker) {
    if (game.attackValue >= 18) {
      if (game.thorns[attacker.id] > 0) {
        game.log.push(`${attacker.name}攻击值>=18，移除全部${game.thorns[attacker.id]}层荆棘。`);
        game.thorns[attacker.id] = 0;
      }
      game.auroraUsesRemaining[attacker.id] += 1;
      game.log.push(`${attacker.name}获得1次曜彩骰使用次数。`);
    }
  },
  onReroll(game, attacker) {
    game.yaoguangRerollsUsed[attacker.id] += 1;
    if (game.yaoguangRerollsUsed[attacker.id] > 2) {
      game.thorns[attacker.id] += 2;
      game.log.push(`${attacker.name}超过2次重投，获得2层荆棘（当前${game.thorns[attacker.id]}层）。`);
    }
  }
});

CharacterHooks.register('baie', {
  onDefenseConfirm(game, defender, selectedDice) {
    if (!game.whiteeGuardUsed[defender.id] && areAllSame(selectedDice)) {
      game.whiteeGuardActive[defender.id] = true;
      game.whiteeGuardUsed[defender.id] = true;
      game.log.push(`${defender.name}触发【白厄】守护，本回合生命最低保留至1（本局限1次）。`);
    }
  },
  onAttackAfterDamageResolved(game, attacker, totalDamage) {
    if (totalDamage > 0) {
      const heal = Math.floor(totalDamage * 0.5);
      if (heal > 0) {
        const before = game.hp[attacker.id];
        const realHeal = Math.min(heal, game.maxHp[attacker.id] - before);
        if (realHeal > 0) {
          game.hp[attacker.id] = before + realHeal;
          pushEffectEvent(game, {
            type: 'heal',
            playerId: attacker.id,
            amount: realHeal,
            hpBefore: before,
            hpAfter: game.hp[attacker.id],
          });
          game.log.push(`${attacker.name}触发【白厄】吸收，回复${realHeal}点生命。`);
        }
      }
    }
  },
  aiScoreDefenseCombo(dice, indices, game, playerId) {
    const selected = indices.map((i) => dice[i]);
    if (game && !game.whiteeGuardUsed[playerId]) {
      if (selected.length > 0 && selected.every((d) => d.value === selected[0].value)) return 15;
    }
    return 0;
  }
});

CharacterHooks.register('xilian', {
  onMainAttackConfirm(game, attacker) {
    game.xilianCumulative[attacker.id] += game.attackValue;
    if (!game.xilianAscensionActive[attacker.id] && game.xilianCumulative[attacker.id] > 24) {
      game.xilianAscensionActive[attacker.id] = true;
      game.attackLevel[attacker.id] = 5;
      game.log.push(`${attacker.name}累计攻防值超过24，攻击等级变为5，此后每回合获得跃升！`);
    }
  },
  onMainDefenseConfirm(game, defender) {
    game.xilianCumulative[defender.id] += game.defenseValue;
    if (!game.xilianAscensionActive[defender.id] && game.xilianCumulative[defender.id] > 24) {
      game.xilianAscensionActive[defender.id] = true;
      game.attackLevel[defender.id] = 5;
      game.log.push(`${defender.name}累计攻防值超过24，攻击防等级变为5，此后每回合获得跃升！`);
    }
  }
});

CharacterHooks.register('daheita', {
  onRoundEnd(game, player) {
    game.auroraUsesRemaining[player.id] += 1;
    game.log.push(`${player.name}触发【大黑塔】回合结束效果，曜彩骰次数+1。`);
  }
});

CharacterHooks.register('xiadie', {
  onDamageApplied(game, defender, attacker, appliedHitValues) {
    for (const hit of appliedHitValues) {
      if (hit >= 8) {
        game.attackLevel[defender.id] += 1;
        game.defenseLevel[defender.id] += 1;
        game.log.push(`${defender.name}触发【遐蝶】防御成长：单次伤害>=8，攻防等级+1。`);
      }
      if (hit > 0 && hit <= 5) {
        const before = game.hp[attacker.id];
        const damage = 3;
        game.hp[attacker.id] -= damage;
        const after = game.hp[attacker.id];
        pushEffectEvent(game, {
          type: 'instant_damage',
          sourcePlayerId: defender.id,
          targetPlayerId: attacker.id,
          amount: damage,
          hpBefore: before,
          hpAfter: after,
        });
        game.log.push(`${defender.name}触发【遐蝶】瞬伤，对${attacker.name}造成3点无视轮次伤害。`);
      }
    }
  }
});

module.exports = CharacterHooks;
