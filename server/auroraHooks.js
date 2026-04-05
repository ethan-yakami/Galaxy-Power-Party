const { getPlayerById, pushEffectEvent } = require('./rooms');

const AuroraHooks = {
  registry: {},

  register(auroraId, hooks) {
    this.registry[auroraId] = hooks;
  },

  canUse(player, game, role) {
    const auroraId = player.auroraDiceId;
    if (!auroraId) return { ok: false, reason: '你尚未装备曜彩骰。' };

    if ((game.auroraUsesRemaining[player.id] || 0) <= 0) return { ok: false, reason: '曜彩骰使用次数已耗尽。' };
    if (game.roundAuroraUsed[player.id]) return { ok: false, reason: '本轮你已使用过曜彩骰。' };

    const hooks = this.registry[auroraId];
    if (hooks && typeof hooks.canUse === 'function') {
      const specificCheck = hooks.canUse(player, game, role);
      if (specificCheck && !specificCheck.ok) return specificCheck;
    }
    
    return { ok: true, reason: '' };
  },

  triggerAEffectOnAttack(game, attacker, auroraDie, room) {
    if (!auroraDie || !auroraDie.hasA) return;
    const hooks = this.registry[auroraDie.auroraId];
    if (hooks && typeof hooks.onAttack === 'function') {
      hooks.onAttack(game, attacker, auroraDie, room);
    }
  },

  triggerAEffectOnDefense(game, defender, auroraDie, room) {
    if (!auroraDie || !auroraDie.hasA) return;
    const hooks = this.registry[auroraDie.auroraId];
    if (hooks && typeof hooks.onDefense === 'function') {
      hooks.onDefense(game, defender, auroraDie, room);
    }
  }
};

AuroraHooks.register('starshield', {
  canUse(player, game, role) {
    if (role !== 'defense') return { ok: false, reason: '星盾只能在防守时使用。' };
  },
  onAttack(game, attacker) {
    game.forceField[attacker.id] = true;
    game.log.push(`${attacker.name}触发【星盾】A效果，本轮获得力场。`);
  },
  onDefense(game, defender) {
    game.forceField[defender.id] = true;
    game.log.push(`${defender.name}触发【星盾】A效果，本轮获得力场。`);
  }
});

AuroraHooks.register('cactus', {
  canUse(player, game, role) {
    if (role !== 'defense') return { ok: false, reason: '仙人球只能在防御时使用。' };
  },
  onDefense(game, defender) {
    game.counterActive[defender.id] = true;
    game.log.push(`${defender.name}触发【仙人球】A效果，本回合获得反击。`);
  }
});

AuroraHooks.register('oath', {
  canUse(player, game, role) {
    if (role !== 'defense') return { ok: false, reason: '誓言只能在防御时使用。' };
  },
  onDefense(game, defender) {
    game.unyielding[defender.id] = true;
    game.log.push(`${defender.name}触发【誓言】A效果，本回合获得不屈（生命值不会降至0以下）。`);
  }
});

AuroraHooks.register('legacy', {
  canUse(player, game, role) {
    if (game.hp[player.id] > 8) return { ok: false, reason: '遗语仅在生命值<=8时可用。' };
  },
  onAttack(game, attacker) {
    game.attackValue *= 2;
    game.log.push(`${attacker.name}触发【遗语】A效果，攻击值翻倍为${game.attackValue}。`);
  },
  onDefense(game, defender) {
    game.defenseValue *= 2;
    game.log.push(`${defender.name}触发【遗语】A效果，防守值翻倍为${game.defenseValue}。`);
  }
});

AuroraHooks.register('evolution', {
  onAttack(game, attacker) {
    game.attackValue *= 2;
    game.log.push(`${attacker.name}触发【进化】A效果，攻击值翻倍为${game.attackValue}。`);
  },
  onDefense(game, defender) {
    game.defenseValue *= 2;
    game.log.push(`${defender.name}触发【进化】A效果，防御值翻倍为${game.defenseValue}。`);
  }
});

AuroraHooks.register('repeater', {
  canUse(player, game, role) {
    if (role !== 'attack') return { ok: false, reason: '复读只能在攻击时使用。' };
    if ((game.selectedFourCount[player.id] || 0) < 2) return { ok: false, reason: '复读需要累计选择两次点数4。' };
  },
  onAttack(game, attacker) {
    game.extraAttackQueued = true;
    game.log.push(`${attacker.name}触发【复读】A效果，本轮将额外进行一次攻击。`);
  },
  onDefense(game, defender) {
    game.extraAttackQueued = true;
    game.log.push(`${defender.name}触发【复读】A效果，本轮将额外进行一次攻击。`);
  }
});

AuroraHooks.register('medic', {
  onAttack(game, attacker, auroraDie) {
    const before = game.hp[attacker.id];
    const healed = Math.min(auroraDie.value, game.maxHp[attacker.id] - before);
    if (healed > 0) {
      game.hp[attacker.id] = before + healed;
      pushEffectEvent(game, {
        type: 'heal',
        playerId: attacker.id,
        amount: healed,
        hpBefore: before,
        hpAfter: game.hp[attacker.id],
      });
      game.log.push(`${attacker.name}触发【医嘱】A效果，回复${healed}点生命值。`);
    } else {
      game.log.push(`${attacker.name}触发【医嘱】A效果，但生命值已满。`);
    }
  },
  onDefense(game, defender, auroraDie) {
    const before = game.hp[defender.id];
    const healed = Math.min(auroraDie.value, game.maxHp[defender.id] - before);
    if (healed > 0) {
      game.hp[defender.id] = before + healed;
      pushEffectEvent(game, {
        type: 'heal',
        playerId: defender.id,
        amount: healed,
        hpBefore: before,
        hpAfter: game.hp[defender.id],
      });
      game.log.push(`${defender.name}触发【医嘱】A效果，回复${healed}点生命值。`);
    } else {
      game.log.push(`${defender.name}触发【医嘱】A效果，但生命值已满。`);
    }
  }
});

AuroraHooks.register('destiny', {
  onAttack(game, attacker) {
    game.log.push(`${attacker.name}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
  },
  onDefense(game, defender) {
    game.log.push(`${defender.name}触发【命运】A效果，获得命定（曜彩骰必须被选中）。`);
  }
});

AuroraHooks.register('loan', {
  onAttack(game, attacker, auroraDie) {
    game.overload[attacker.id] += auroraDie.value;
    game.log.push(`${attacker.name}触发【贷款】A效果，获得${auroraDie.value}层超载（当前${game.overload[attacker.id]}层）。`);
  },
  onDefense(game, defender, auroraDie) {
    game.overload[defender.id] += auroraDie.value;
    game.log.push(`${defender.name}触发【贷款】A效果，获得${auroraDie.value}层超载（当前${game.overload[defender.id]}层）。`);
  }
});

AuroraHooks.register('bigredbutton', {
  canUse(player, game, role) {
    if (role !== 'attack') return { ok: false, reason: '大红按钮只能在攻击时使用。' };
    if (game.round < 5) return { ok: false, reason: '大红按钮需要回合数>=5。' };
  },
  onAttack(game, attacker) {
    const before = game.hp[attacker.id];
    const lost = before - 1;
    if (lost > 0) {
      game.hp[attacker.id] = 1;
      game.desperateBonus[attacker.id] += lost;
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: attacker.id,
        targetPlayerId: attacker.id,
        amount: lost,
        hpBefore: before,
        hpAfter: 1,
      });
      game.log.push(`${attacker.name}触发【大红按钮】A效果，背水！生命值降为1，攻击值+${lost}。`);
    } else {
      game.log.push(`${attacker.name}触发【大红按钮】A效果，但生命值已为1。`);
    }
  }
});

AuroraHooks.register('trickster', {
  onAttack(game, attacker) {
    game.hackActive[attacker.id] = true;
    game.log.push(`${attacker.name}触发【奇术师】A效果，本回合获得骇入。`);
  },
  onDefense(game, defender) {
    game.hackActive[defender.id] = true;
    game.log.push(`${defender.name}触发【奇术师】A效果，本回合获得骇入。`);
  }
});

AuroraHooks.register('heartbeat', {
  onAttack(game, attacker) {
    game.auroraUsesRemaining[attacker.id] += 1;
    game.log.push(`${attacker.name}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
  },
  onDefense(game, defender) {
    game.auroraUsesRemaining[defender.id] += 1;
    game.log.push(`${defender.name}触发【心跳】A效果，获得1次曜彩骰使用次数。`);
  }
});

AuroraHooks.register('berserker', {
  onAttack(game, attacker, auroraDie) {
    const thornLayers = Math.floor(auroraDie.value / 4);
    game.thorns[attacker.id] += thornLayers;
    game.log.push(`${attacker.name}触发【战狂】A效果，获得${thornLayers}层荆棘（当前${game.thorns[attacker.id]}层）。`);
  },
  onDefense(game, defender, auroraDie) {
    const thornLayers = Math.floor(auroraDie.value / 4);
    game.thorns[defender.id] += thornLayers;
    game.log.push(`${defender.name}触发【战狂】A效果，获得${thornLayers}层荆棘（当前${game.thorns[defender.id]}层）。`);
  }
});

AuroraHooks.register('magicbullet', {
  onAttack(game, attacker, auroraDie, room) {
    const defender = getPlayerById(room, game.defenderId);
    const before = game.hp[defender.id];
    game.hp[defender.id] -= 3;
    pushEffectEvent(game, {
      type: 'instant_damage',
      sourcePlayerId: attacker.id,
      targetPlayerId: defender.id,
      amount: 3,
      hpBefore: before,
      hpAfter: game.hp[defender.id],
    });
    game.log.push(`${attacker.name}触发【魔弹】A效果，对${defender.name}造成3点瞬伤。`);
  },
  onDefense(game, defender, auroraDie, room) {
    const attacker = getPlayerById(room, game.attackerId);
    const before = game.hp[attacker.id];
    game.hp[attacker.id] -= 3;
    pushEffectEvent(game, {
      type: 'instant_damage',
      sourcePlayerId: defender.id,
      targetPlayerId: attacker.id,
      amount: 3,
      hpBefore: before,
      hpAfter: game.hp[attacker.id],
    });
    game.log.push(`${defender.name}触发【魔弹】A效果，对${attacker.name}造成3点瞬伤。`);
  }
});

AuroraHooks.register('revenge', {
  canUse(player, game, role) {
    if (role !== 'attack') return { ok: false, reason: '复仇只能在攻击时使用。' };
    if ((game.cumulativeDamageTaken[player.id] || 0) < 25) return { ok: false, reason: '复仇需要累计受到25点伤害。' };
  }
});

AuroraHooks.register('miracle', {
  canUse(player, game, role) {
    if (role !== 'attack') return { ok: false, reason: '奇迹只能在攻击时使用。' };
    if ((game.selectedOneCount[player.id] || 0) < 9) return { ok: false, reason: '奇迹需要累计选择9次骰面1。' };
  }
});

AuroraHooks.register('gambler', {
  canUse(player, game, role) {
    if (game.round > 4) return { ok: false, reason: '赌徒仅能在前4回合内使用。' };
  }
});

module.exports = AuroraHooks;
