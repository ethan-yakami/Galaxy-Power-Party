const CharacterHooks = require('./characterHooks');
const AuroraHooks = require('./auroraHooks');
const { getPlayerById, pushEffectEvent } = require('./rooms');

function canUseAurora(player, game, role) {
  return AuroraHooks.canUse(player, game, role);
}

function triggerAuroraA(game, actorId) {
  game.auroraAEffectCount[actorId] += 1;
}

function applyAuroraAEffectOnAttack(room, game, attacker, selectedDice) {
  const auroraDie = selectedDice.find((d) => d.isAurora && d.hasA);
  if (!auroraDie) return;
  triggerAuroraA(game, attacker.id);
  AuroraHooks.triggerAEffectOnAttack(game, attacker, auroraDie, room);
}

function applyAuroraAEffectOnDefense(room, game, defender, selectedDice) {
  const auroraDie = selectedDice.find((d) => d.isAurora && d.hasA);
  if (!auroraDie) return;
  triggerAuroraA(game, defender.id);
  AuroraHooks.triggerAEffectOnDefense(game, defender, auroraDie, room);
}

function applyAscension(room, game, player, selectedDice) {
  let shouldAscend = false;
  if (player.characterId === 'daheita' && (game.auroraAEffectCount[player.id] || 0) >= 4) {
    shouldAscend = true;
  }
  if (player.characterId === 'xilian' && game.xilianAscensionActive[player.id]) {
    shouldAscend = true;
  }
  if (!shouldAscend || !selectedDice.length) return;

  let minDie = selectedDice[0];
  for (const d of selectedDice) {
    if (d.value < minDie.value) minDie = d;
  }

  minDie.value = minDie.maxValue;
  minDie.label = minDie.hasA ? `${minDie.value}A` : `${minDie.value}`;
  game.log.push(`${player.name}触发【跃升】，将最小点骰子提升到最大值${minDie.maxValue}。`);
}

function applyHackEffects(game, attacker, defender) {
  if (game.hackActive[attacker.id] && game.defenseSelection) {
    let maxDie = null;
    for (const idx of game.defenseSelection) {
      const d = game.defenseDice[idx];
      if (!d.isAurora && (!maxDie || d.value > maxDie.value)) maxDie = d;
    }
    if (maxDie && maxDie.value > 2) {
      const diff = maxDie.value - 2;
      maxDie.value = 2;
      maxDie.label = '2';
      game.defenseValue -= diff;
      game.log.push(`${attacker.name}的【骇入】生效，${defender.name}防守值-${diff}（变为${game.defenseValue}）。`);
    }
  }
  if (game.hackActive[defender.id] && game.attackSelection) {
    let maxDie = null;
    for (const idx of game.attackSelection) {
      const d = game.attackDice[idx];
      if (!d.isAurora && (!maxDie || d.value > maxDie.value)) maxDie = d;
    }
    if (maxDie && maxDie.value > 2) {
      const diff = maxDie.value - 2;
      maxDie.value = 2;
      maxDie.label = '2';
      game.attackValue -= diff;
      game.log.push(`${defender.name}的【骇入】生效，${attacker.name}攻击值-${diff}（变为${game.attackValue}）。`);
    }
  }
}

function applyThornsDamage(game, room) {
  for (const p of room.players) {
    if (game.thorns[p.id] > 0) {
      const before = game.hp[p.id];
      game.hp[p.id] -= game.thorns[p.id];
      pushEffectEvent(game, {
        type: 'instant_damage',
        sourcePlayerId: p.id,
        targetPlayerId: p.id,
        amount: game.thorns[p.id],
        hpBefore: before,
        hpAfter: game.hp[p.id],
      });
      game.log.push(`${p.name}受到${game.thorns[p.id]}层荆棘伤害。`);
      game.thorns[p.id] = 0;
    }
  }
}

function checkGameOver(room, game) {
  const p1 = room.players[0];
  const p2 = room.players[1];
  if (game.hp[p1.id] <= 0 || game.hp[p2.id] <= 0) {
    room.status = 'ended';
    game.status = 'ended';
    game.phase = 'ended';
    if (game.hp[p1.id] <= 0 && game.hp[p2.id] <= 0) {
      game.winnerId = game.attackerId;
      game.log.push('双方同时归零，判定当前攻击方获胜。');
    } else if (game.hp[p1.id] <= 0) {
      game.winnerId = p2.id;
      game.log.push(`${p1.name}生命值归零，${p2.name}获胜！`);
    } else {
      game.winnerId = p1.id;
      game.log.push(`${p2.name}生命值归零，${p1.name}获胜！`);
    }
    return true;
  }
  return false;
}

function applyCharacterAttackSkill(room, game, attacker, selectedDice) {
  CharacterHooks.trigger('onAttackConfirm', game, attacker, selectedDice, room);
}

function applyXiadieDefendPassives(room, game, defender, attacker, appliedHitValues) {
  CharacterHooks.trigger('onDamageApplied', game, defender, attacker, appliedHitValues, room);
}

function calcHits(game) {
  let base = game.attackValue;
  if (!game.attackPierce) {
    base = Math.max(0, game.attackValue - game.defenseValue);
  }
  const hits = [base];
  if (game.extraAttackQueued) hits.push(base);
  return hits;
}

module.exports = {
  canUseAurora,
  triggerAuroraA,
  applyAuroraAEffectOnAttack,
  applyAuroraAEffectOnDefense,
  applyAscension,
  applyHackEffects,
  applyThornsDamage,
  checkGameOver,
  applyCharacterAttackSkill,
  applyXiadieDefendPassives,
  calcHits,
};
