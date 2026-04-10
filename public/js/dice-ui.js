(function() {
  const { state, send } = GPP;

  let liveSelectionTimeout = null;
  let dragSelection = null;

  function sumSelectedIndices(dice, indices) {
    let sum = 0;
    indices.forEach((idx) => {
      if (dice[idx]) sum += dice[idx].value;
    });
    return sum;
  }

  function getRawNeedCountForPhase(game, phase) {
    if (phase === 'attack') {
      return game.attackLevel && game.attackLevel[game.attackerId] !== undefined ? game.attackLevel[game.attackerId] : 3;
    }
    return game.defenseLevel && game.defenseLevel[game.defenderId] !== undefined ? game.defenseLevel[game.defenderId] : 3;
  }

  function getEffectiveSelectionCount(requestedCount, diceCount) {
    const requested = Number.isInteger(requestedCount) ? requestedCount : 1;
    const maxCount = Number.isInteger(diceCount) && diceCount > 0 ? diceCount : 1;
    if (requested < 1) return 1;
    if (requested > maxCount) return maxCount;
    return requested;
  }

  function getNeedCountForPhase(game, phase) {
    const rawNeed = getRawNeedCountForPhase(game, phase);
    const dice = phase === 'attack' ? game.attackDice : game.defenseDice;
    const diceCount = Array.isArray(dice) ? dice.length : 0;
    return getEffectiveSelectionCount(rawNeed, diceCount);
  }

  function toggleDie(index, maxSelectable) {
    if (state.selectedDice.has(index)) {
      state.selectedDice.delete(index);
    } else if (maxSelectable === null || maxSelectable === undefined || state.selectedDice.size < maxSelectable) {
      state.selectedDice.add(index);
    }
    clearTimeout(liveSelectionTimeout);
    liveSelectionTimeout = setTimeout(() => {
      send('update_live_selection', { indices: [...state.selectedDice] });
    }, 80);
    GPP.render();
  }

  function applySelectionMode(index, maxSelectable, mode) {
    if (mode === 'remove') {
      state.selectedDice.delete(index);
      return;
    }
    if (state.selectedDice.has(index)) return;
    if (maxSelectable !== null && maxSelectable !== undefined && state.selectedDice.size >= maxSelectable) return;
    state.selectedDice.add(index);
  }

  function syncLiveSelection() {
    clearTimeout(liveSelectionTimeout);
    liveSelectionTimeout = setTimeout(() => {
      send('update_live_selection', { indices: [...state.selectedDice] });
    }, 80);
  }

  function beginDragSelection(index, maxSelectable) {
    const mode = state.selectedDice.has(index) ? 'remove' : 'add';
    dragSelection = {
      mode,
      maxSelectable,
      visited: new Set(),
    };
    dragSelection.visited.add(index);
    applySelectionMode(index, maxSelectable, mode);
    syncLiveSelection();
    GPP.render();
  }

  function moveDragSelection(index) {
    if (!dragSelection) return;
    if (dragSelection.visited.has(index)) return;
    dragSelection.visited.add(index);
    applySelectionMode(index, dragSelection.maxSelectable, dragSelection.mode);
    syncLiveSelection();
    GPP.render();
  }

  function endDragSelection() {
    dragSelection = null;
  }

  function getDieShapeClass(die) {
    if (die.isAurora) return 'shape-aurora';
    if (die.sides === 4) return 'shape-d4';
    if (die.sides === 6) return 'shape-d6';
    if (die.sides === 8) return 'shape-d8';
    if (die.sides === 12) return 'shape-d12';
    return 'shape-d6';
  }

  function renderDice(dice, maxSelectable, clickable, selectedSet) {
    const row = document.createElement('div');
    row.className = 'diceRow';

    dice.forEach((die, index) => {
      const node = document.createElement('div');
      node.className = `die ${getDieShapeClass(die)}`;
      if (selectedSet && selectedSet.has(index)) node.classList.add('selected');

      const label = document.createElement('span');
      label.className = 'dieLabel';
      label.textContent = die.label;
      node.appendChild(label);

      if (clickable) {
        node.onpointerdown = (event) => {
          event.preventDefault();
          beginDragSelection(index, maxSelectable);
        };
        node.onpointerenter = () => {
          moveDragSelection(index);
        };
        node.onpointerup = () => {
          endDragSelection();
        };
        node.onpointercancel = () => {
          endDragSelection();
        };
        node.onmouseleave = () => {
          if (!dragSelection) return;
        };
      } else {
        node.onpointerdown = null;
        node.onpointerenter = null;
      }
      row.appendChild(node);
    });

    return row;
  }

  function renderAuroraHints(dice) {
    const seen = {};
    const box = document.createElement('div');
    box.className = 'auroraDesc';

    dice.forEach((d) => {
      if (!d.isAurora || !d.auroraId || seen[d.auroraId]) return;
      seen[d.auroraId] = true;

      const p = document.createElement('p');
      p.textContent = `曜彩骰【${d.auroraName}】：${d.effectText}；条件：${d.conditionText}`;
      box.appendChild(p);
    });

    if (!box.childNodes.length) return null;
    return box;
  }

  function getDisplayedDiceForPlayer(game, playerId) {
    if (game.attackerId === playerId && game.attackDice) {
      if (game.attackSelection && game.attackSelection.length) {
        return {
          dice: game.attackSelection.map((idx) => game.attackDice[idx]).filter(Boolean),
          lane: 'attack_selected',
        };
      }
      return { dice: game.attackDice, lane: 'attack' };
    }

    if (game.defenderId === playerId && game.defenseDice) {
      return { dice: game.defenseDice, lane: 'defense' };
    }

    return null;
  }

  function getCommittedSumForPlayer(game, playerId) {
    if (game.attackerId === playerId && game.attackSelection && game.attackDice) {
      return {
        sum: game.attackValue,
        count: game.attackSelection.length,
        kind: game.attackPierce ? '攻击(洞穿)' : '攻击',
        pierce: !!game.attackPierce,
      };
    }

    if (game.defenderId === playerId && game.defenseSelection && game.defenseDice) {
      return { sum: game.defenseValue, count: game.defenseSelection.length, kind: '防守', pierce: false };
    }

    return null;
  }

  function getPreviewSelectionForPlayer(game, playerId) {
    if (game.phase === 'attack_reroll_or_select' && game.attackerId === playerId && game.attackDice) {
      const indices = game.attackPreviewSelection || [];
      return {
        indices,
        sum: sumSelectedIndices(game.attackDice, indices),
        kind: '攻击实时',
      };
    }

    if (game.phase === 'defense_select' && game.defenderId === playerId && game.defenseDice) {
      const indices = game.defensePreviewSelection || [];
      return {
        indices,
        sum: sumSelectedIndices(game.defenseDice, indices),
        kind: '防守实时',
      };
    }

    return null;
  }

  Object.assign(GPP, {
    sumSelectedIndices,
    getRawNeedCountForPhase,
    getEffectiveSelectionCount,
    getNeedCountForPhase,
    toggleDie,
    renderDice,
    renderAuroraHints,
    getDisplayedDiceForPlayer,
    getCommittedSumForPlayer,
    getPreviewSelectionForPlayer,
  });

  window.addEventListener('pointerup', endDragSelection);
  window.addEventListener('pointercancel', endDragSelection);
})();
