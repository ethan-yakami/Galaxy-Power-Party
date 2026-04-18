(function() {
  const { state, send } = GPP;
  const LIVE_SELECTION_SYNC_MS = 20;
  const POINTER_CLICK_SUPPRESS_MS = 120;

  let liveSelectionTimeout = null;
  let dragSelection = null;
  let lastSelectionInputAt = 0;

  function refreshSelectionUi() {
    if (typeof GPP.refreshDiceSelectionUi === 'function') {
      GPP.refreshDiceSelectionUi({
        dragIndices: dragSelection ? [...dragSelection.visited] : [],
      });
      return;
    }
    GPP.render();
  }

  function sumSelectedIndices(dice, indices) {
    let sum = 0;
    indices.forEach((idx) => {
      if (dice[idx]) sum += dice[idx].value;
    });
    return sum;
  }

  function hasDuplicates(values) {
    return new Set(values).size !== values.length;
  }

  function areAllSame(values) {
    return values.length > 0 && values.every((value) => value === values[0]);
  }

  function includesValue(values, target) {
    return values.includes(target);
  }

  function countOddValues(values) {
    return values.filter((value) => value % 2 !== 0).length;
  }

  function getSelectedValues(dice, indices) {
    return indices.map((idx) => (dice[idx] ? dice[idx].value : null)).filter((value) => Number.isFinite(value));
  }

  function getPreviewWeatherBonus(game, playerId, lane, values, baseSum) {
    const weatherId = game && game.weather && typeof game.weather.weatherId === 'string'
      ? game.weather.weatherId
      : '';
    if (!weatherId || !values.length) return 0;

    if (lane === 'defense') {
      if (weatherId === 'thunder_rain') return 4;
      if (weatherId === 'big_snow' && includesValue(values, 7)) return 4;
      return 0;
    }

    if (weatherId === 'thunder_rain') return 4;
    if (weatherId === 'big_snow' && includesValue(values, 7)) return 4;
    if (weatherId === 'eclipse' && !areAllSame(values)) return 4;
    if (weatherId === 'drought') {
      const defenderId = game.defenderId;
      const defenseLevel = defenderId && game.defenseLevel ? game.defenseLevel[defenderId] : 0;
      return (Number.isFinite(defenseLevel) ? defenseLevel : 0) * 3;
    }
    if (weatherId === 'sun_moon' && game.hp && playerId && Number(game.hp[playerId]) <= 3) {
      return baseSum;
    }
    if (weatherId === 'sandstorm' && countOddValues(values) === values.length) {
      return 3;
    }
    return 0;
  }

  function getPreviewSelectionValue(game, lane, playerId, dice, indices) {
    const baseSum = sumSelectedIndices(dice, indices);
    const values = getSelectedValues(dice, indices);
    const weatherBonus = getPreviewWeatherBonus(game, playerId, lane, values, baseSum);
    return {
      baseSum,
      weatherBonus,
      sum: baseSum + weatherBonus,
    };
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

  function getMaxSelectableForPhase(game, phase) {
    if (!game) return null;
    if (phase === 'attack' && game.phase === 'attack_reroll_or_select') {
      return null;
    }
    return getNeedCountForPhase(game, phase);
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
    }, LIVE_SELECTION_SYNC_MS);
    refreshSelectionUi();
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
    }, LIVE_SELECTION_SYNC_MS);
  }

  function beginDragSelection(index, maxSelectable) {
    lastSelectionInputAt = Date.now();
    const mode = state.selectedDice.has(index) ? 'remove' : 'add';
    dragSelection = {
      mode,
      maxSelectable,
      visited: new Set(),
    };
    dragSelection.visited.add(index);
    applySelectionMode(index, maxSelectable, mode);
    syncLiveSelection();
    refreshSelectionUi();
  }

  function moveDragSelection(index) {
    if (!dragSelection) return;
    if (dragSelection.visited.has(index)) return;
    dragSelection.visited.add(index);
    applySelectionMode(index, dragSelection.maxSelectable, dragSelection.mode);
    syncLiveSelection();
    refreshSelectionUi();
  }

  function endDragSelection() {
    if (!dragSelection) return;
    dragSelection = null;
    refreshSelectionUi();
  }

  function getDieShapeClass(die) {
    if (die.isAurora) return 'shape-aurora';
    if (die.sides === 4) return 'shape-d4';
    if (die.sides === 6) return 'shape-d6';
    if (die.sides === 8) return 'shape-d8';
    if (die.sides === 12) return 'shape-d12';
    return 'shape-d6';
  }

  function renderDice(dice, maxSelectable, clickable, selectedSet, options = {}) {
    const row = document.createElement('div');
    row.className = 'diceRow';
    row.dataset.selectionRow = options.selectionRow ? 'true' : 'false';
    row.dataset.playerId = options.playerId || '';
    row.dataset.lane = options.lane || '';
    row.dataset.clickable = clickable ? 'true' : 'false';

    dice.forEach((die, index) => {
      const node = document.createElement('div');
      node.className = `die ${getDieShapeClass(die)}`;
      node.dataset.dieIndex = String(index);
      if (selectedSet && selectedSet.has(index)) node.classList.add('selected');

      const label = document.createElement('span');
      label.className = 'dieLabel';
      label.textContent = die.label;
      node.appendChild(label);

      if (clickable) {
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-pressed', selectedSet && selectedSet.has(index) ? 'true' : 'false');
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
        node.onclick = (event) => {
          if (Date.now() - lastSelectionInputAt < POINTER_CLICK_SUPPRESS_MS) return;
          event.preventDefault();
          toggleDie(index, maxSelectable);
        };
        node.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          lastSelectionInputAt = Date.now();
          toggleDie(index, maxSelectable);
        };
      } else {
        node.tabIndex = -1;
        node.removeAttribute('role');
        node.removeAttribute('aria-pressed');
        node.onpointerdown = null;
        node.onpointerenter = null;
        node.onpointerup = null;
        node.onpointercancel = null;
        node.onclick = null;
        node.onkeydown = null;
      }
      row.appendChild(node);
    });

    return row;
  }

  function renderAuroraHints(dice) {
    const seen = {};
    const box = document.createElement('div');
    box.className = 'auroraDesc';

    const sanitizeDisplayName = (name) => String(name || '').replace(/[\[\]【】]/g, '').trim();

    dice.forEach((d) => {
      if (!d.isAurora || !d.auroraId || seen[d.auroraId]) return;
      seen[d.auroraId] = true;

      const p = document.createElement('p');
      const auroraName = sanitizeDisplayName(d.auroraName);
      p.textContent = `曜彩骰 ${auroraName}：${d.effectText}；条件：${d.conditionText}`;
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
      const previewValue = getPreviewSelectionValue(game, 'attack', playerId, game.attackDice, indices);
      return {
        indices,
        sum: previewValue.sum,
        baseSum: previewValue.baseSum,
        weatherBonus: previewValue.weatherBonus,
        kind: '攻击实时',
      };
    }

    if (game.phase === 'defense_select' && game.defenderId === playerId && game.defenseDice) {
      const indices = game.defensePreviewSelection || [];
      const previewValue = getPreviewSelectionValue(game, 'defense', playerId, game.defenseDice, indices);
      return {
        indices,
        sum: previewValue.sum,
        baseSum: previewValue.baseSum,
        weatherBonus: previewValue.weatherBonus,
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
    getMaxSelectableForPhase,
    getPreviewSelectionValue,
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
