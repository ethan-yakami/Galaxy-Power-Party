(function() {
  const { state, dom, send } = GPP;
  const BattleViewModel = window.GPPBattleViewModel || {
    deriveBattleView() {
      return {
        kind: 'idle',
        actionKind: null,
        actionLabel: '',
        isMyTurn: false,
        isEnemyTurn: false,
        isAiThinking: false,
        turnText: 'Waiting for room sync',
        railTitle: 'Waiting for room sync',
        railHint: 'Room state will appear here shortly.',
        roomStatusTone: 'waiting',
      };
    },
  };
  const sanitizeDisplayName = GPP.sanitizeDisplayName || ((name) => String(name || '').replace(/[\[\]【】]/g, '').trim());

  const STATUS_NAME_MAP = {
    poison: '中毒',
    thorns: '荆棘',
    power: '力量',
    resilience: '韧性',
    overload: '超载',
    unyielding: '不屈',
    forceField: '力场',
    hackActive: '骇入',
    counterActive: '反击',
  };
  const PHASE_LABEL_MAP = {
    attack_roll: '攻击掷骰',
    attack_reroll_or_select: '攻击重投/选骰',
    defense_roll: '防御掷骰',
    defense_select: '防御选骰',
    ended: '对战结束',
  };


  const PORTRAIT_NAME_ALIAS = {
    '丹恒-腾荒': '丹恒',
  };

  function getMe() {
    if (!state.room || !Array.isArray(state.room.players)) return null;
    return state.room.players.find((player) => player.id === state.me) || null;
  }

  function getEnemy() {
    if (!state.room || !Array.isArray(state.room.players)) return null;
    return state.room.players.find((player) => player.id !== state.me) || null;
  }

  function getCharacter(characterId) {
    return state.characters[characterId] || null;
  }

  function getAurora(auroraId) {
    return (state.auroraDice || []).find((item) => item.id === auroraId) || null;
  }

  function allowsNoAurora(character) {
    return !!(character && character.allowsNoAurora);
  }

  function setHidden(node, hidden) {
    if (!node) return;
    node.classList.toggle('hidden', !!hidden);
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPhaseLabel(phase) {
    return PHASE_LABEL_MAP[phase] || String(phase || '-');
  }


  function getPortraitUrls(name, portraitUrl) {
    const urls = [];
    if (portraitUrl) urls.push(portraitUrl);
    const sanitized = sanitizeDisplayName(name);
    if (!sanitized || sanitized === '未公开') return urls;
    const fileName = PORTRAIT_NAME_ALIAS[sanitized] || sanitized;
    urls.push(`/portraits/${encodeURIComponent(fileName)}.png`);
    urls.push(`/picture/${encodeURIComponent(fileName)}.png`);
    return urls.filter((url, index, arr) => url && arr.indexOf(url) === index);
  }

  function createPortrait(player, options = {}) {
    const node = document.createElement('div');
    node.className = options.containerClassName || 'portrait';

    const characterName = sanitizeDisplayName(player && player.characterName);
    const fallbackSource = characterName || sanitizeDisplayName(player && player.name) || '?';
    const urls = getPortraitUrls(characterName, player && player.portraitUrl);
    const renderFallback = () => {
      if (node.childNodes.length > 0) return;
      const text = document.createElement('span');
      text.textContent = (fallbackSource.charAt(0) || '?').toUpperCase();
      node.appendChild(text);
    };

    if (!urls.length) {
      renderFallback();
      return node;
    }

    const img = document.createElement('img');
    img.alt = player && player.name ? player.name : 'portrait';
    img.loading = 'lazy';
    if (options.imageClassName) img.className = options.imageClassName;

    let currentIndex = 0;
    img.onerror = () => {
      currentIndex += 1;
      if (currentIndex < urls.length) {
        img.src = urls[currentIndex];
        return;
      }
      img.remove();
      renderFallback();
    };

    img.src = urls[currentIndex];
    node.appendChild(img);
    return node;
  }

  function getLobbyTooltip() {
    let node = document.getElementById('lobbyHoverTooltip');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'lobbyHoverTooltip';
    node.className = 'floatingTooltip hidden';
    document.body.appendChild(node);
    return node;
  }

  function positionLobbyTooltip(node, event, target) {
    if (!node) return;
    const offset = 14;
    let left = 24;
    let top = 24;
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      left = event.clientX + offset;
      top = event.clientY + offset;
    } else if (target && typeof target.getBoundingClientRect === 'function') {
      const rect = target.getBoundingClientRect();
      left = rect.right + offset;
      top = rect.top + offset;
    }
    const maxLeft = window.innerWidth - node.offsetWidth - 12;
    const maxTop = window.innerHeight - node.offsetHeight - 12;
    node.style.left = `${Math.min(Math.max(12, left), Math.max(12, maxLeft))}px`;
    node.style.top = `${Math.min(Math.max(12, top), Math.max(12, maxTop))}px`;
  }

  function showLobbyTooltip(event, button, title, lines) {
    const tooltip = getLobbyTooltip();
    const body = (lines || []).filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
    tooltip.innerHTML = title ? `<strong>${escapeHtml(title)}</strong>${body}` : body;
    tooltip.classList.remove('hidden');
    positionLobbyTooltip(tooltip, event, button);
  }

  function hideLobbyTooltip() {
    const tooltip = document.getElementById('lobbyHoverTooltip');
    if (tooltip) tooltip.classList.add('hidden');
  }

  function bindLobbyTooltip(button, title, lines) {
    if (!button) return;
    const tooltipLines = [title, ...(lines || []).filter(Boolean)];
    const tooltipText = tooltipLines.join('\n').trim();
    button.classList.add('hasTooltip');
    if (!button.hasAttribute('tabindex')) {
      button.tabIndex = 0;
    }
    if (tooltipText) {
      button.title = tooltipText;
      button.setAttribute('aria-label', tooltipText);
    }
    button.addEventListener('mouseenter', (event) => showLobbyTooltip(event, button, title, lines));
    button.addEventListener('mousemove', (event) => showLobbyTooltip(event, button, title, lines));
    button.addEventListener('mouseleave', hideLobbyTooltip);
    button.addEventListener('focus', () => showLobbyTooltip(null, button, title, lines));
    button.addEventListener('blur', hideLobbyTooltip);
  }

  function getLobbyRefs() {
    const auroraColumn = dom.auroraButtons ? dom.auroraButtons.closest('.lobbyCol') : null;
    const columns = auroraColumn ? auroraColumn.parentElement : null;
    const topConfirmBtn = document.getElementById('confirmLoadoutTopBtn');
    return { auroraColumn, columns, topConfirmBtn };
  }

  function sortCharacterList() {
    return Object.values(state.characters).sort((a, b) => {
      const customDiff = Number(!!a.isCustomVariant) - Number(!!b.isCustomVariant);
      if (customDiff) return customDiff;
      return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-Hans-CN');
    });
  }

  function normalizeLoadout(input) {
    return {
      characterId: (input && input.characterId) || '',
      auroraId: (input && (input.auroraId || input.auroraDiceId)) || '',
    };
  }

  function loadoutsMatch(left, right) {
    const a = normalizeLoadout(left);
    const b = normalizeLoadout(right);
    return a.characterId === b.characterId && a.auroraId === b.auroraId;
  }

  function getServerSelection(me) {
    const character = getCharacter(me && me.characterId);
    return {
      characterId: (me && me.characterId) || '',
      auroraId: (me && me.auroraDiceId) || '',
      character,
      aurora: getAurora(me && me.auroraDiceId),
      skipAurora: allowsNoAurora(character),
      auroraConfirmed: !!(me && me.auroraSelectionConfirmed),
    };
  }

  function getDraftSelection(me) {
    const serverSelection = getServerSelection(me);
    const draftCharacterId = state.ui.pendingCharacterId || serverSelection.characterId;
    const draftCharacter = getCharacter(draftCharacterId);
    const skipAurora = allowsNoAurora(draftCharacter);
    const draftAuroraId = skipAurora
      ? ''
      : ((state.ui.pendingAuroraDiceId !== null && state.ui.pendingAuroraDiceId !== undefined)
        ? state.ui.pendingAuroraDiceId
        : serverSelection.auroraId);

    return {
      characterId: draftCharacterId,
      auroraId: draftAuroraId || '',
      character: draftCharacter,
      aurora: getAurora(draftAuroraId),
      skipAurora,
    };
  }

  function hasCompleteDraft(draftSelection) {
    if (!draftSelection.characterId) return false;
    if (draftSelection.skipAurora) return true;
    return !!draftSelection.auroraId;
  }

  function markDraftDirty() {
    const me = getMe();
    const serverSelection = getServerSelection(me);
    const draftSelection = getDraftSelection(me);
    state.ui.pendingDirty = !loadoutsMatch(serverSelection, draftSelection);
    state.ui.loadoutSubmitting = false;
    state.ui.submittedLoadout = null;
  }

  function chooseCharacter(characterId) {
    const character = getCharacter(characterId);
    if (!character) return;
    state.ui.pendingCharacterId = characterId;
    state.ui.pendingAuroraDiceId = allowsNoAurora(character) ? '' : '';
    markDraftDirty();
    GPP.render();
  }

  function chooseAurora(auroraId) {
    state.ui.pendingAuroraDiceId = auroraId || '';
    markDraftDirty();
    GPP.render();
  }

  function submitLoadout() {
    const me = getMe();
    if (!me || state.ui.loadoutSubmitting) return;
    const draftSelection = getDraftSelection(me);
    if (!hasCompleteDraft(draftSelection)) return;

    const payload = {
      characterId: draftSelection.characterId,
      auroraDiceId: draftSelection.skipAurora ? null : draftSelection.auroraId,
    };

    state.ui.loadoutSubmitting = true;
    state.ui.submittedLoadout = {
      characterId: payload.characterId,
      auroraDiceId: payload.auroraDiceId || '',
    };
    send('apply_preset', payload);
    GPP.render();
  }

  function formatPlayerLoadout(player) {
    if (!player) return '未加入';
    const character = getCharacter(player.characterId);
    const characterText = player.characterName && player.characterName !== 'unknown'
      ? player.characterName
      : (character ? character.name : (player.characterId || '未选角色'));
    const auroraText = player.auroraDiceName
      || (player.auroraDiceId ? (getAurora(player.auroraDiceId)?.name || player.auroraDiceId) : '')
      || (allowsNoAurora(character) ? '无需曜彩骰' : '未选曜彩骰');
    return `${characterText} / ${auroraText}`;
  }

  function updateConfirmButtons(label, disabled, hidden) {
    const { topConfirmBtn } = getLobbyRefs();
    [dom.confirmLoadoutBtn, topConfirmBtn].forEach((button) => {
      if (!button) return;
      button.textContent = label;
      button.disabled = disabled;
      setHidden(button, hidden);
      if (!hidden) {
        button.onclick = submitLoadout;
      }
    });
  }

  function renderPlayersList() {
    if (!dom.playersList) return;
    dom.playersList.innerHTML = '';
    const players = (state.room && state.room.players) || [];
    players.forEach((player) => {
      const item = document.createElement('li');
      item.className = 'playerItem';
      if (player.id === state.me) item.classList.add('me');

      const top = document.createElement('div');
      top.className = 'playerItemTop';

      const identity = document.createElement('div');
      identity.className = 'playerIdentity';
      identity.appendChild(createPortrait(player));

      const labels = document.createElement('div');
      labels.className = 'playerLabelStack';

      const name = document.createElement('p');
      name.className = 'playerName';
      name.textContent = `${sanitizeDisplayName(player.name)}${player.id === state.me ? '（你）' : ''}`;
      labels.appendChild(name);

      const loadout = document.createElement('p');
      loadout.className = 'playerLoadout';
      loadout.textContent = formatPlayerLoadout(player);
      labels.appendChild(loadout);

      identity.appendChild(labels);
      top.appendChild(identity);

      const presence = document.createElement('p');
      const online = player.isOnline !== false;
      presence.className = `playerPresence ${online ? 'online' : 'offline'}`;
      presence.textContent = online ? '在线' : '离线';
      top.appendChild(presence);

      item.appendChild(top);
      dom.playersList.appendChild(item);
    });
  }

  function renderSelectionSummary() {
    if (!dom.selectionSummary) return;
    const me = getMe();
    if (!me) {
      dom.selectionSummary.textContent = '等待房间信息...';
      updateConfirmButtons('开始对战', true, false);
      return;
    }

    const serverSelection = getServerSelection(me);
    const draftSelection = getDraftSelection(me);
    const completeDraft = hasCompleteDraft(draftSelection);
    const alreadyApplied = loadoutsMatch(serverSelection, draftSelection) && serverSelection.auroraConfirmed;

    const roleText = draftSelection.character ? draftSelection.character.name : '未选择';
    const auroraText = draftSelection.skipAurora
      ? '无需曜彩骰'
      : (draftSelection.aurora ? draftSelection.aurora.name : '未选择');

    dom.selectionSummary.innerHTML = '';
    const summaryMain = document.createElement('div');
    summaryMain.className = 'summaryMain';

    const pendingLine = document.createElement('p');
    pendingLine.innerHTML = `<b>待提交</b>：${escapeHtml(sanitizeDisplayName(roleText))} / ${escapeHtml(sanitizeDisplayName(auroraText))}`;
    summaryMain.appendChild(pendingLine);

    const confirmedCharacter = sanitizeDisplayName(
      serverSelection.character ? serverSelection.character.name : (me.characterName || '未确认')
    );
    const confirmedAurora = sanitizeDisplayName(
      serverSelection.skipAurora
        ? '无需曜彩骰'
        : (serverSelection.aurora ? serverSelection.aurora.name : (me.auroraDiceName || '未确认'))
    );
    const confirmedLine = document.createElement('p');
    confirmedLine.innerHTML = `<b>已提交</b>：${escapeHtml(confirmedCharacter)} / ${escapeHtml(confirmedAurora)}`;
    summaryMain.appendChild(confirmedLine);

    dom.selectionSummary.appendChild(summaryMain);
    dom.selectionSummary.appendChild(createPortrait(
      { name: me.name, characterName: roleText },
      { containerClassName: 'summaryPortraitCluster', imageClassName: 'summaryPortraitImg' }
    ));

    if (dom.confirmHint) {
      if (!draftSelection.characterId) {
        dom.confirmHint.textContent = '先选择角色，再完成大厅配置。';
      } else if (draftSelection.skipAurora) {
        dom.confirmHint.textContent = '该角色无需曜彩骰，点击“开始对战”即可提交。';
      } else if (!draftSelection.auroraId) {
        dom.confirmHint.textContent = '请选择曜彩骰后再开始对战。';
      } else {
        dom.confirmHint.textContent = '当前选择会先保存在本地，点击“开始对战”后正式提交。';
      }
    }

    if (dom.lobbyHint) {
      if (state.ui.loadoutSubmitting) {
        dom.lobbyHint.textContent = '正在提交当前配置...';
      } else if (!completeDraft) {
        dom.lobbyHint.textContent = draftSelection.skipAurora ? '请选择角色后开始对战。' : '请选择角色与曜彩骰。';
      } else if (alreadyApplied) {
        dom.lobbyHint.textContent = '当前配置已提交，等待双方完成后自动开局。';
      } else if (state.ui.pendingDirty) {
        dom.lobbyHint.textContent = '你有尚未提交的大厅配置。';
      } else {
        dom.lobbyHint.textContent = '配置已准备好，点击“开始对战”提交。';
      }
    }

    updateConfirmButtons(
      state.ui.loadoutSubmitting ? '提交中...' : (alreadyApplied ? '等待开局' : '开始对战'),
      !completeDraft || alreadyApplied || state.ui.loadoutSubmitting,
      false
    );
  }

  function buildLobbyButton(text, active, clickHandler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = active ? 'primaryBtn' : 'secondaryBtn';
    button.textContent = text;
    button.onclick = clickHandler;
    return button;
  }

  function renderCharacterButtons() {
    if (!dom.characterButtons) return;
    dom.characterButtons.innerHTML = '';
    const me = getMe();
    if (!me) return;

    const draftSelection = getDraftSelection(me);
    sortCharacterList().forEach((character) => {
      const label = character.isCustomVariant ? `${character.name} [变体]` : character.name;
      const button = buildLobbyButton(label, character.id === draftSelection.characterId, () => chooseCharacter(character.id));
      bindLobbyTooltip(button, character.name, [
        character.shortSpec || '',
        character.skillText || '',
      ]);
      dom.characterButtons.appendChild(button);
    });
  }

  function renderAuroraButtons() {
    if (!dom.auroraButtons) return;
    dom.auroraButtons.innerHTML = '';
    const me = getMe();
    const { auroraColumn, columns } = getLobbyRefs();
    if (!me) {
      if (auroraColumn) setHidden(auroraColumn, false);
      if (columns) columns.style.gridTemplateColumns = '';
      return;
    }

    const draftSelection = getDraftSelection(me);
    if (draftSelection.skipAurora) {
      if (auroraColumn) setHidden(auroraColumn, true);
      if (columns) columns.style.gridTemplateColumns = '1fr';
      return;
    }

    if (auroraColumn) setHidden(auroraColumn, false);
    if (columns) columns.style.gridTemplateColumns = '1fr 1fr';

    (state.auroraDice || []).forEach((aurora) => {
      const button = buildLobbyButton(aurora.name, aurora.id === draftSelection.auroraId, () => chooseAurora(aurora.id));
      bindLobbyTooltip(button, aurora.name, [
        aurora.facesText || '',
        aurora.effectText || '',
        `条件：${aurora.conditionText || '无'}`,
      ]);
      dom.auroraButtons.appendChild(button);
    });
  }

  function renderLobby() {
    renderSelectionSummary();
    renderCharacterButtons();
    renderAuroraButtons();
  }

  function getBattleView() {
    return BattleViewModel.deriveBattleView(
      state.room && state.room.game,
      state.me,
      state.room && state.room.players
    );
  }

  function renderWeatherStatusCard() {
    if (!dom.weatherStatusCard) return;
    const game = state.room && state.room.game;
    if (!game) {
      setHidden(dom.weatherStatusCard, true);
      return;
    }

    const display = GPP.getWeatherDisplay(game);
    dom.weatherStatusCard.className = `weatherStatusCard weatherTypeCard-${display.typeClass}`;
    dom.weatherStatusCard.innerHTML = [
      '<p class="weatherStatusLabel">当前天气</p>',
      '<div class="weatherStatusHead">',
      `  <h4>${escapeHtml(display.name)}</h4>`,
      `  <p class="weatherStatusMeta">${escapeHtml(display.type)} | 阶段 ${display.stageRound}</p>`,
      '</div>',
      `  <p class="weatherStatusDesc">${escapeHtml(display.effect)}</p>`,
    ].join('');
    setHidden(dom.weatherStatusCard, false);
  }

  function renderTurnOwnershipCard(view) {
    if (!dom.turnOwnershipCard) return;
    const game = state.room && state.room.game;
    if (!game) {
      setHidden(dom.turnOwnershipCard, true);
      return;
    }

    let toneClass = 'turnOwner-neutral';
    if (view.kind === 'self') toneClass = 'turnOwner-self';
    if (view.kind === 'enemy') toneClass = 'turnOwner-enemy';
    dom.turnOwnershipCard.className = `turnOwnershipCard ${toneClass}`;
    dom.turnOwnershipCard.innerHTML = [
      '<p class="turnOwnershipLabel">当前行动</p>',
      `  <p class="turnOwnershipText">${escapeHtml(view.turnText)}</p>`,
      `  <p class="railHint">${escapeHtml(view.railHint)}</p>`,
    ].join('');
    setHidden(dom.turnOwnershipCard, false);
  }

  function renderRoomStatusBar(view) {
    if (!dom.roomStatusBar) return;
    if (!state.room) {
      setHidden(dom.roomStatusBar, true);
      return;
    }

    let tone = 'waiting';
    let text = `房间 ${state.room.code}`;

    if (!state.room.game) {
      const readyCount = (state.room.players || []).filter((player) => player && player.auroraSelectionConfirmed).length;
      tone = readyCount >= 2 ? 'ready' : (readyCount > 0 ? 'progress' : 'waiting');
      text = readyCount >= 2
        ? '双方配置已完成，正在准备开局...'
        : `大厅配置中：${readyCount}/${(state.room.players || []).length} 已提交`;
    } else if (view.kind === 'ended') {
      tone = 'ended';
      text = view.turnText;
    } else {
      tone = view.roomStatusTone || 'active';
      text = view.turnText;
    }

    dom.roomStatusBar.className = `roomStatusBar roomStatusBar-${tone}`;
    dom.roomStatusBar.textContent = text;
    setHidden(dom.roomStatusBar, false);
  }

  function buildStatusPills(game, playerId) {
    const wrap = document.createElement('div');
    wrap.className = 'statusBadge';

    Object.keys(STATUS_NAME_MAP).forEach((key) => {
      const value = game[key] && game[key][playerId];
      if (!value) return;
      const item = document.createElement('div');
      item.className = `statusPill status-${key}`;
      item.textContent = typeof value === 'boolean' ? STATUS_NAME_MAP[key] : `${STATUS_NAME_MAP[key]} ${value}`;
      wrap.appendChild(item);
    });

    return wrap.childNodes.length ? wrap : null;
  }

  function renderBattlePlayerZone(player, isEnemy) {
    const zone = isEnemy ? dom.enemyZone : dom.selfZone;
    if (!zone) return;
    zone.innerHTML = '';

    if (!player || !state.room || !state.room.game) {
      zone.textContent = isEnemy ? '等待对手加入...' : '等待自己加入...';
      return;
    }

    const game = state.room.game;
    const character = getCharacter(player.characterId);

    const header = document.createElement('div');
    header.className = 'zoneHeader';

    const profile = document.createElement('div');
    profile.className = 'zoneProfile';
    profile.appendChild(createPortrait(player));

    const profileText = document.createElement('div');

    const name = document.createElement('h3');
    name.textContent = sanitizeDisplayName(player.name);
    profileText.appendChild(name);

    const characterLine = document.createElement('p');
    characterLine.className = 'charName';
    const characterName = character ? character.name : (player.characterName || player.characterId || '未知');
    characterLine.textContent = `角色：${characterName}`;
    if (character) {
      bindLobbyTooltip(characterLine, character.name, [
        character.shortSpec || '',
        character.skillText || '',
      ]);
    }
    profileText.appendChild(characterLine);

    const auroraLine = document.createElement('p');
    auroraLine.className = 'auroraName';
    const aurora = player.auroraDiceId ? getAurora(player.auroraDiceId) : null;
    auroraLine.textContent = player.auroraDiceId
      ? `曜彩骰：${aurora ? aurora.name : (player.auroraDiceName || player.auroraDiceId)}`
      : `曜彩骰：${allowsNoAurora(character) ? '无需装备' : '未装备'}`;
    if (aurora) {
      bindLobbyTooltip(auroraLine, aurora.name || player.auroraDiceName || player.auroraDiceId, [
        aurora.facesText || '',
        aurora.effectText || '',
        `条件：${aurora.conditionText || '无'}`,
      ]);
    }
    profileText.appendChild(auroraLine);

    profile.appendChild(profileText);
    header.appendChild(profile);

    const headerStatus = document.createElement('div');
    headerStatus.className = 'zoneHeaderStatus';

    const hp = document.createElement('div');
    hp.className = 'hpBadge';
    hp.dataset.playerId = player.id;
    hp.textContent = `HP ${game.hp[player.id]}`;
    headerStatus.appendChild(hp);

    const stats = document.createElement('div');
    stats.className = 'atkDefBox';
    stats.innerHTML = [
      `<span class="atkDefItem">攻 ${game.attackLevel[player.id]}</span>`,
      `<span class="atkDefItem">防 ${game.defenseLevel[player.id]}</span>`,
    ].join('');
    headerStatus.appendChild(stats);
    header.appendChild(headerStatus);
    zone.appendChild(header);

    const pills = buildStatusPills(game, player.id);
    if (pills) zone.appendChild(pills);

    const displayed = GPP.getDisplayedDiceForPlayer(game, player.id);
    if (!displayed || !displayed.dice || !displayed.dice.length) return;

    const isPickable = !isEnemy && (
      (game.phase === 'attack_reroll_or_select' && game.attackerId === player.id) ||
      (game.phase === 'defense_select' && game.defenderId === player.id)
    );
    const lane = displayed.lane === 'attack' ? 'attack' : 'defense';
    const maxSelectable = isPickable ? GPP.getNeedCountForPhase(game, lane) : null;
    zone.appendChild(GPP.renderDice(displayed.dice, maxSelectable, isPickable, isPickable ? state.selectedDice : null));

    const preview = GPP.getPreviewSelectionForPlayer(game, player.id);
    if (preview && preview.indices.length > 0) {
      const hint = document.createElement('div');
      hint.className = 'previewHint';
      hint.textContent = `${preview.kind}：${preview.sum}（已选 ${preview.indices.length} 枚）`;
      zone.appendChild(hint);
    }

    const committed = GPP.getCommittedSumForPlayer(game, player.id);
    if (committed && !preview) {
      const hint = document.createElement('div');
      hint.className = 'committedHint';
      hint.textContent = `${committed.kind}：${committed.sum}（使用 ${committed.count} 枚）`;
      zone.appendChild(hint);
    }

    const auroraHints = GPP.renderAuroraHints(displayed.dice);
    if (auroraHints) zone.appendChild(auroraHints);
  }

  function hasAuroraInPool(game, role) {
    const dice = role === 'attack' ? game.attackDice : game.defenseDice;
    return Array.isArray(dice) && dice.some((die) => die && die.isAurora);
  }

  function appendRailButton(container, className, text, disabled, onClick) {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = text;
    button.disabled = !!disabled;
    button.onclick = onClick;
    container.appendChild(button);
  }

  function renderActionRail(view) {
    if (!dom.actionRail) return;
    dom.actionRail.innerHTML = '';
    const game = state.room && state.room.game;
    if (!game) return;

    const wrap = document.createElement('div');
    wrap.className = 'railActions';

    const title = document.createElement('h3');
    title.textContent = view.railTitle;
    dom.actionRail.appendChild(title);

    const info = document.createElement('div');
    info.className = 'railInfo';
    [
      `阶段 ${getPhaseLabel(game.phase)}`,
      `回合 ${game.round}`,
      `攻 ${game.attackValue == null ? '-' : game.attackValue}`,
      `防 ${game.defenseValue == null ? '-' : game.defenseValue}`,
    ].forEach((text) => {
      const chip = document.createElement('span');
      chip.className = 'infoChip';
      chip.textContent = text;
      info.appendChild(chip);
    });
    dom.actionRail.appendChild(info);

    const hint = document.createElement('p');
    hint.className = 'railHint';
    hint.textContent = view.railHint;
    dom.actionRail.appendChild(hint);

    if (view.kind === 'self') {
      const myAuroraUses = (game.auroraUsesRemaining && game.auroraUsesRemaining[state.me]) || 0;

      if (view.actionKind === 'attack_roll') {
        appendRailButton(wrap, 'primaryBtn', '掷攻击骰', false, () => send('roll_attack', {}));
      }

      if (view.actionKind === 'attack_select') {
        if (myAuroraUses > 0 && !hasAuroraInPool(game, 'attack')) {
          appendRailButton(wrap, 'secondaryBtn', '加入曜彩骰', false, () => send('use_aurora_die', {}));
        }

        appendRailButton(
          wrap,
          'secondaryBtn',
          `重投已选骰（剩余 ${game.rerollsLeft || 0} 次）`,
          !state.selectedDice.size || (game.rerollsLeft || 0) <= 0,
          () => {
            send('reroll_attack', { indices: [...state.selectedDice] });
            GPP.clearSelection();
          }
        );

        const attackNeed = GPP.getNeedCountForPhase(game, 'attack');
        appendRailButton(
          wrap,
          'primaryBtn',
          `确认攻击（需选 ${attackNeed} 枚）`,
          state.selectedDice.size !== attackNeed,
          () => {
            send('confirm_attack_selection', { indices: [...state.selectedDice] });
            GPP.clearSelection();
          }
        );
      }

      if (view.actionKind === 'defense_roll') {
        appendRailButton(wrap, 'primaryBtn', '掷防御骰', false, () => send('roll_defense', {}));
      }

      if (view.actionKind === 'defense_select') {
        if (myAuroraUses > 0 && !hasAuroraInPool(game, 'defense')) {
          appendRailButton(wrap, 'secondaryBtn', '加入曜彩骰', false, () => send('use_aurora_die', {}));
        }

        const defenseNeed = GPP.getNeedCountForPhase(game, 'defense');
        appendRailButton(
          wrap,
          'primaryBtn',
          `确认防御（需选 ${defenseNeed} 枚）`,
          state.selectedDice.size !== defenseNeed,
          () => {
            send('confirm_defense_selection', { indices: [...state.selectedDice] });
            GPP.clearSelection();
          }
        );
      }
    } else if (view.kind === 'ended') {
      const endedNote = document.createElement('p');
      endedNote.className = 'railHint';
      endedNote.textContent = game.winnerId === state.me ? '你赢得了这场对战。' : '本场对战已结束。';
      wrap.appendChild(endedNote);
    } else {
      const waiting = document.createElement('p');
      waiting.className = 'railHint';
      waiting.textContent = view.isAiThinking
        ? 'AI 会自动完成当前动作；如果阶段内有多次更新，这是曜彩骰或重投带来的正常推进。'
        : '等待对手完成当前动作。';
      wrap.appendChild(waiting);
    }

    dom.actionRail.appendChild(wrap);
  }

  function renderLog() {
    if (!dom.logBox) return;
    dom.logBox.innerHTML = '';
    const logs = (state.room && state.room.game && state.room.game.log) || [];
    logs.slice(-80).forEach((line) => {
      const row = document.createElement('div');
      row.className = 'logEntry';
      row.textContent = line;
      dom.logBox.appendChild(row);
    });
  }

  function renderBattleMeta(view) {
    if (!state.room || !state.room.game) return;
    const game = state.room.game;
    if (dom.roundInfo) {
      dom.roundInfo.textContent = `第 ${game.round} 回合`;
    }
    if (dom.turnInfo) {
      dom.turnInfo.textContent = view.turnText;
    }
    if (dom.battleCenterScore) {
      const attackValue = game.attackValue == null ? '-' : game.attackValue;
      const defenseValue = game.defenseValue == null ? '-' : game.defenseValue;
      dom.battleCenterScore.textContent = `攻 ${attackValue} / 防 ${defenseValue}`;
    }
    if (dom.weatherBanner) {
      const weather = game.weather;
      const hasWeather = !!(weather && weather.weatherName);
      setHidden(dom.weatherBanner, !hasWeather);
      if (hasWeather) {
        dom.weatherBanner.textContent = `天气：${weather.weatherName} | ${weather.weatherType}`;
      }
    }
  }

  function ensureStaticBindings() {
    if (dom.logToggleBtn && !dom.logToggleBtn.dataset.bound) {
      dom.logToggleBtn.dataset.bound = '1';
      dom.logToggleBtn.onclick = () => {
        state.ui.logDrawerOpen = !state.ui.logDrawerOpen;
        GPP.render();
      };
    }
  }

  function renderBattle(view) {
    renderBattleMeta(view);
    renderBattlePlayerZone(getEnemy(), true);
    renderBattlePlayerZone(getMe(), false);
    renderActionRail(view);
    renderLog();
    if (dom.logDrawer) {
      dom.logDrawer.classList.toggle('open', !!state.ui.logDrawerOpen);
    }
    if (dom.logToggleBtn) {
      dom.logToggleBtn.textContent = state.ui.logDrawerOpen ? '收起战斗日志' : '展开战斗日志';
    }
  }

  function renderLayout(view) {
    const hasRoom = !!state.room;
    const inGame = !!(state.room && state.room.game);
    setHidden(dom.connectionPanel, hasRoom);
    setHidden(dom.roomPanel, !hasRoom);
    setHidden(dom.headerRoomInfo, !hasRoom);
    setHidden(dom.lobbyArea, !hasRoom || inGame);
    setHidden(dom.lobbyControls, !hasRoom || inGame);
    setHidden(dom.gameArea, !inGame);
    if (dom.roomCodeEl) {
      dom.roomCodeEl.textContent = hasRoom ? state.room.code : '-';
    }
    renderRoomStatusBar(view);
  }

  function render() {
    ensureStaticBindings();
    const view = getBattleView();
    renderLayout(view);
    if (!state.room) return;

    renderPlayersList();
    renderWeatherStatusCard();
    renderTurnOwnershipCard(view);

    if (!state.room.game) {
      renderLobby();
      return;
    }

    renderBattle(view);
  }

  GPP.render = render;
})();
