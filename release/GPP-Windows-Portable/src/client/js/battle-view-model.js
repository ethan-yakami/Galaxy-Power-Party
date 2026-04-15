(function initBattleViewModel(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPBattleViewModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildBattleViewModel() {
  const ACTION_LABELS = Object.freeze({
    attack_roll: '掷攻击骰',
    attack_select: '选择攻击骰',
    defense_roll: '掷防御骰',
    defense_select: '选择防御骰',
  });

  function getPendingActionKind(game) {
    if (!game) return null;
    if (game.pendingActionKind) return game.pendingActionKind;
    switch (game.phase) {
      case 'attack_roll': return 'attack_roll';
      case 'attack_reroll_or_select': return 'attack_select';
      case 'defense_roll': return 'defense_roll';
      case 'defense_select': return 'defense_select';
      default: return null;
    }
  }

  function getPendingActorId(game) {
    if (!game) return null;
    if (game.pendingActorId) return game.pendingActorId;
    const kind = getPendingActionKind(game);
    if (kind === 'attack_roll' || kind === 'attack_select') return game.attackerId || null;
    if (kind === 'defense_roll' || kind === 'defense_select') return game.defenderId || null;
    return null;
  }

  function getActionLabel(kind, fallback) {
    if (kind && ACTION_LABELS[kind]) return ACTION_LABELS[kind];
    return fallback || '等待行动';
  }

  function getPlayer(players, playerId) {
    if (!Array.isArray(players)) return null;
    return players.find((player) => player && player.id === playerId) || null;
  }

  function buildWaitingText(actor, label, isMe, isAiThinking) {
    if (isMe) {
      return `等待你${label}`;
    }
    if (actor && actor.id === 'AI') {
      return `${isAiThinking ? 'AI 正在' : '等待 AI '}${label}`;
    }
    return actor && actor.name ? `等待 ${actor.name}${label}` : `等待对手${label}`;
  }

  function deriveBattleView(game, meId, players) {
    if (!game) {
      return {
        kind: 'idle',
        actionKind: null,
        actionLabel: '',
        actorId: null,
        actor: null,
        isMyTurn: false,
        isEnemyTurn: false,
        isAiThinking: false,
        turnText: '等待房间同步',
        railTitle: '等待房间同步',
        railHint: '房间状态同步后会显示当前可执行动作。',
        roomStatusTone: 'waiting',
      };
    }

    if (game.status === 'ended' || game.phase === 'ended') {
      return {
        kind: 'ended',
        actionKind: null,
        actionLabel: '对战结束',
        actorId: null,
        actor: null,
        isMyTurn: false,
        isEnemyTurn: false,
        isAiThinking: false,
        turnText: game.winnerId ? `对战结束，胜者：${game.winnerId === meId ? '你' : '对手'}` : '对战结束',
        railTitle: '对战已结束',
        railHint: '可以查看战斗日志，或等待重新开始。',
        roomStatusTone: 'ended',
      };
    }

    const actionKind = getPendingActionKind(game);
    const actorId = getPendingActorId(game);
    const actor = getPlayer(players, actorId);
    const actionLabel = getActionLabel(actionKind, game.pendingActionLabel);
    const isMyTurn = !!actorId && actorId === meId;
    const isEnemyTurn = !!actorId && actorId !== meId;
    const isAiThinking = !!game.isAiThinking;
    const actorName = actor && actor.name ? actor.name : (isMyTurn ? '你' : '对手');

    if (isMyTurn) {
      return {
        kind: 'self',
        actionKind,
        actionLabel,
        actorId,
        actor,
        isMyTurn,
        isEnemyTurn,
        isAiThinking,
        turnText: `轮到你${actionLabel}`,
        railTitle: `现在请${actionLabel}`,
        railHint: '根据当前阶段执行动作，提交后会自动推进到下一步。',
        roomStatusTone: 'active',
      };
    }

    return {
      kind: 'enemy',
      actionKind,
      actionLabel,
      actorId,
      actor,
      isMyTurn,
      isEnemyTurn,
      isAiThinking,
      turnText: buildWaitingText(actor, actionLabel, false, isAiThinking),
      railTitle: buildWaitingText(actor, actionLabel, false, isAiThinking),
      railHint: isAiThinking
        ? 'AI 正在处理这一阶段，请稍候，战局会自动继续。'
        : `${actorName} 完成当前动作后，将自动进入下一步。`,
      roomStatusTone: isAiThinking ? 'progress' : 'waiting',
    };
  }

  return Object.freeze({
    ACTION_LABELS,
    getPendingActionKind,
    getPendingActorId,
    getActionLabel,
    deriveBattleView,
  });
});
