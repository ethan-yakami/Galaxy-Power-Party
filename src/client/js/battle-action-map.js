(function() {
  const selectors = (window.GPP && window.GPP.selectors) || {};
  const indicesToMask = selectors.indicesToMask || function fallbackIndicesToMask(indices, maxCount) {
    if (!Array.isArray(indices)) return -1;
    let mask = 0;
    const limit = Number.isInteger(maxCount) ? maxCount : 6;
    for (let i = 0; i < indices.length; i += 1) {
      const idx = indices[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= limit || idx >= 6) return -1;
      const bit = 1 << idx;
      if (mask & bit) return -1;
      mask |= bit;
    }
    return mask;
  };

  function getBattleActionsForCurrentState(state, game) {
    const ticket = state.battleActions;
    if (!ticket || !game) return null;
    if (ticket.phase !== game.phase) return null;
    if (ticket.round !== game.round) return null;
    return ticket;
  }

  function findAction(ticket, kind, mask) {
    if (!ticket || !Array.isArray(ticket.actions)) return null;
    for (let i = 0; i < ticket.actions.length; i += 1) {
      const action = ticket.actions[i];
      if (!action || action.kind !== kind) continue;
      if (mask == null || action.mask === mask) return action;
    }
    return null;
  }

  function submitBattleAction(send, ticket, action) {
    if (!ticket || !action) return false;
    send('submit_battle_action', {
      turnId: ticket.turnId,
      actionId: action.actionId,
    });
    return true;
  }

  function hasAuroraInPool(game, role) {
    const dice = role === 'attack' ? game.attackDice : game.defenseDice;
    return Array.isArray(dice) && dice.some((die) => die && die.isAurora);
  }

  function createBattleRailActionModel({ state, view, send }) {
    const game = state.room && state.room.game;
    const model = { buttons: [], note: '' };
    if (!game || view.kind !== 'self') return model;

    const ticket = getBattleActionsForCurrentState(state, game);
    const myAuroraUses = (game.auroraUsesRemaining && game.auroraUsesRemaining[state.me]) || 0;
    const selectedIndices = Array.from(state.selectedDice || []);
    const attackMask = indicesToMask(selectedIndices, Array.isArray(game.attackDice) ? game.attackDice.length : 6);
    const defenseMask = indicesToMask(selectedIndices, Array.isArray(game.defenseDice) ? game.defenseDice.length : 6);

    if (view.actionKind === 'attack_roll') {
      const action = findAction(ticket, 'roll_attack');
      model.buttons.push({
        className: 'primaryBtn',
        text: '掷攻击骰',
        disabled: !action,
        onClick() {
          submitBattleAction(send, ticket, action);
        },
      });
      return model;
    }

    if (view.actionKind === 'attack_select') {
      const auroraAction = findAction(ticket, 'use_aurora_attack');
      if (myAuroraUses > 0 && !hasAuroraInPool(game, 'attack') && auroraAction) {
        model.buttons.push({
          className: 'secondaryBtn',
          text: '加入曜彩骰',
          disabled: false,
          onClick() {
            submitBattleAction(send, ticket, auroraAction);
          },
        });
      }

      const rerollAction = attackMask > 0 ? findAction(ticket, 'reroll_attack', attackMask) : null;
      model.buttons.push({
        className: 'secondaryBtn',
        text: `重投已选骰（剩余 ${game.rerollsLeft || 0} 次）`,
        disabled: !state.selectedDice.size || (game.rerollsLeft || 0) <= 0 || !rerollAction,
        onClick() {
          if (!submitBattleAction(send, ticket, rerollAction)) return;
          if (window.GPP && typeof window.GPP.clearSelection === 'function') window.GPP.clearSelection();
        },
      });

      const attackNeed = window.GPP.getNeedCountForPhase(game, 'attack');
      const confirmAction = attackMask > 0 ? findAction(ticket, 'confirm_attack', attackMask) : null;
      model.buttons.push({
        className: 'primaryBtn',
        text: `确认攻击（需选 ${attackNeed} 枚）`,
        disabled: state.selectedDice.size !== attackNeed || !confirmAction,
        onClick() {
          if (!submitBattleAction(send, ticket, confirmAction)) return;
          if (window.GPP && typeof window.GPP.clearSelection === 'function') window.GPP.clearSelection();
        },
      });
      return model;
    }

    if (view.actionKind === 'defense_roll') {
      const action = findAction(ticket, 'roll_defense');
      model.buttons.push({
        className: 'primaryBtn',
        text: '掷防御骰',
        disabled: !action,
        onClick() {
          submitBattleAction(send, ticket, action);
        },
      });
      return model;
    }

    if (view.actionKind === 'defense_select') {
      const auroraAction = findAction(ticket, 'use_aurora_defense');
      if (myAuroraUses > 0 && !hasAuroraInPool(game, 'defense') && auroraAction) {
        model.buttons.push({
          className: 'secondaryBtn',
          text: '加入曜彩骰',
          disabled: false,
          onClick() {
            submitBattleAction(send, ticket, auroraAction);
          },
        });
      }

      const defenseNeed = window.GPP.getNeedCountForPhase(game, 'defense');
      const confirmAction = defenseMask > 0 ? findAction(ticket, 'confirm_defense', defenseMask) : null;
      model.buttons.push({
        className: 'primaryBtn',
        text: `确认防御（需选 ${defenseNeed} 枚）`,
        disabled: state.selectedDice.size !== defenseNeed || !confirmAction,
        onClick() {
          if (!submitBattleAction(send, ticket, confirmAction)) return;
          if (window.GPP && typeof window.GPP.clearSelection === 'function') window.GPP.clearSelection();
        },
      });
    }

    return model;
  }

  window.GPP = window.GPP || {};
  window.GPP.battleActionMap = {
    getBattleActionsForCurrentState,
    createBattleRailActionModel,
  };
})();

