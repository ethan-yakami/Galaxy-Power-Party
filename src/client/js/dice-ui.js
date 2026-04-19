(function() {
  const { state, send } = GPP;
  const LIVE_SELECTION_SYNC_MS = 16;
  const DRAG_ACTIVATION_PX = 6;

  let liveSelectionTimeout = null;
  let dragSelection = null;
  let clickSuppressionTimeout = null;
  let suppressNextClick = false;

  function refreshSelectionUi() {
    if (typeof GPP.refreshDiceSelectionUi === 'function') {
      GPP.refreshDiceSelectionUi({
        dragIndices: dragSelection && dragSelection.moved ? [...dragSelection.visited] : [],
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

  function clearClickSuppressionTimer() {
    if (clickSuppressionTimeout) clearTimeout(clickSuppressionTimeout);
    clickSuppressionTimeout = null;
  }

  function scheduleClickSuppressionClear() {
    clearClickSuppressionTimer();
    clickSuppressionTimeout = setTimeout(() => {
      suppressNextClick = false;
      clickSuppressionTimeout = null;
    }, 0);
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

  function getEventPoint(event) {
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    return {
      x: Number(event.clientX),
      y: Number(event.clientY),
    };
  }

  function hasDragActivation(session, event) {
    const point = getEventPoint(event);
    if (!session || !point || !session.startPoint) return false;
    return Math.hypot(point.x - session.startPoint.x, point.y - session.startPoint.y) >= DRAG_ACTIVATION_PX;
  }

  function parseDieIndex(node) {
    if (!node || !node.dataset) return -1;
    const value = Number(node.dataset.dieIndex);
    return Number.isInteger(value) && value >= 0 ? value : -1;
  }

  function getDieNodeFromPoint(row, event) {
    const point = getEventPoint(event);
    if (!row || !point) return null;

    if (typeof document.elementFromPoint === 'function') {
      const candidate = document.elementFromPoint(point.x, point.y);
      const directHit = candidate && typeof candidate.closest === 'function'
        ? candidate.closest('.die[data-die-index]')
        : null;
      if (directHit && row.contains(directHit)) return directHit;
    }

    const dieNodes = Array.from(row.querySelectorAll('.die[data-die-index]'));
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < dieNodes.length; i += 1) {
      const node = dieNodes[i];
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;
      const rect = node.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) continue;
      if (point.y < rect.top - 28 || point.y > rect.bottom + 28) continue;
      const distance = point.x < rect.left
        ? (rect.left - point.x)
        : (point.x > rect.right ? (point.x - rect.right) : 0);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function getDieNodeFromPointer(row, event) {
    const hit = getDieNodeFromPoint(row, event);
    if (hit) return hit;
    const target = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest('.die[data-die-index]')
      : null;
    if (target && row && row.contains(target)) return target;
    return null;
  }

  function beginDragSelection(index, maxSelectable, row, event) {
    const point = getEventPoint(event);
    suppressNextClick = true;
    clearClickSuppressionTimer();
    const mode = state.selectedDice.has(index) ? 'remove' : 'add';
    dragSelection = {
      row,
      pointerId: event && Number.isFinite(event.pointerId) ? Number(event.pointerId) : null,
      mode,
      maxSelectable,
      anchorIndex: index,
      visited: new Set(),
      startPoint: point,
      moved: false,
    };
    dragSelection.visited.add(index);
    applySelectionMode(index, maxSelectable, mode);
    if (row && typeof row.setPointerCapture === 'function' && dragSelection.pointerId !== null) {
      try {
        row.setPointerCapture(dragSelection.pointerId);
      } catch {}
    }
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

  function moveDragSelectionFromPointer(event) {
    if (!dragSelection) return;
    if (dragSelection.pointerId !== null && event && Number.isFinite(event.pointerId) && Number(event.pointerId) !== dragSelection.pointerId) {
      return;
    }
    const row = dragSelection.row;
    if (!row) return;
    const node = getDieNodeFromPointer(row, event);
    const index = parseDieIndex(node);
    if (index < 0 || index === dragSelection.anchorIndex) return;
    if (!dragSelection.moved && !hasDragActivation(dragSelection, event)) return;
    dragSelection.moved = true;
    moveDragSelection(index);
  }

  function endDragSelection(event) {
    if (!dragSelection) return;
    if (dragSelection.pointerId !== null && event && Number.isFinite(event.pointerId) && Number(event.pointerId) !== dragSelection.pointerId) {
      return;
    }
    const row = dragSelection.row;
    if (row && typeof row.releasePointerCapture === 'function' && dragSelection.pointerId !== null) {
      try {
        if (!row.hasPointerCapture || row.hasPointerCapture(dragSelection.pointerId)) {
          row.releasePointerCapture(dragSelection.pointerId);
        }
      } catch {}
    }
    dragSelection = null;
    refreshSelectionUi();
    scheduleClickSuppressionClear();
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
    row.style.touchAction = clickable ? 'none' : '';

    if (clickable) {
      row.onpointermove = (event) => {
        moveDragSelectionFromPointer(event);
      };
      row.onpointerup = (event) => {
        endDragSelection(event);
      };
      row.onpointercancel = (event) => {
        endDragSelection(event);
      };
      row.onlostpointercapture = () => {
        endDragSelection();
      };
    } else {
      row.onpointermove = null;
      row.onpointerup = null;
      row.onpointercancel = null;
      row.onlostpointercapture = null;
    }

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
          if (event && event.button !== undefined && event.button !== 0) return;
          event.preventDefault();
          beginDragSelection(index, maxSelectable, row, event);
        };
        node.onclick = (event) => {
          if (suppressNextClick) {
            suppressNextClick = false;
            event.preventDefault();
            return;
          }
          event.preventDefault();
          toggleDie(index, maxSelectable);
        };
        node.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          toggleDie(index, maxSelectable);
        };
      } else {
        node.tabIndex = -1;
        node.removeAttribute('role');
        node.removeAttribute('aria-pressed');
        node.onpointerdown = null;
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
