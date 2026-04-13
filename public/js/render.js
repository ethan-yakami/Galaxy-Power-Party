(function() {
  const { state, dom, send, sendWithFeedback } = GPP;

  const PHASE_LABELS = {
    attack_roll: '攻击投掷',
    attack_reroll_or_select: '攻击调整',
    defense_roll: '防御投掷',
    defense_select: '防御选择',
    ended: '结算',
  };
  let floatingTooltipState = null;
  let floatingTooltipEventsBound = false;
  let glossaryTooltipDelegationBound = false;

  function getPhaseLabel(phase) {
    return PHASE_LABELS[phase] || phase;
  }

  function getPlayerName(room, playerId) {
    if (!room || !Array.isArray(room.players)) return '-';
    const player = room.players.find((p) => p && p.id === playerId);
    return player ? sanitizeDisplayName(player.name) : '-';
  }

  function getMapNumber(map, key, fallback = 0) {
    if (!map || key === undefined || key === null) return fallback;
    const value = map[key];
    return typeof value === 'number' ? value : fallback;
  }

  function formatDiceLabels(dice) {
    if (!Array.isArray(dice) || !dice.length) return '--';
    return dice
      .map((die) => (die && die.label ? die.label : '?'))
      .join(' ');
  }

  function formatSelectedDice(dice, indices) {
    if (!Array.isArray(dice) || !Array.isArray(indices) || !indices.length) return '--';
    const picked = indices
      .map((idx) => (Number.isInteger(idx) && dice[idx] ? dice[idx].label : null))
      .filter(Boolean);
    if (!picked.length) return '--';
    const sum = indices.reduce((acc, idx) => {
      const die = Number.isInteger(idx) ? dice[idx] : null;
      return acc + (die && typeof die.value === 'number' ? die.value : 0);
    }, 0);
    return `${picked.join(' + ')} = ${sum}`;
  }

  function formatStatusLine(game, room, playerId) {
    const parts = [];
    const poison = getMapNumber(game.poison, playerId, 0);
    const resilience = getMapNumber(game.resilience, playerId, 0);
    const thorns = getMapNumber(game.thorns, playerId, 0);
    const power = getMapNumber(game.power, playerId, 0);
    const overload = getMapNumber(game.overload, playerId, 0);
    const desperate = getMapNumber(game.desperateBonus, playerId, 0);
    const aCount = getMapNumber(game.auroraAEffectCount, playerId, 0);
    const auroraLeft = getMapNumber(game.auroraUsesRemaining, playerId, 0);

    if (poison > 0) parts.push(`中毒${poison}`);
    if (resilience > 0) parts.push(`韧性${resilience}`);
    if (thorns > 0) parts.push(`荆棘${thorns}`);
    if (power > 0) parts.push(`力量${power}`);
    if (overload > 0) parts.push(`超载${overload}`);
    if (desperate > 0) parts.push(`背水+${desperate}`);
    if (game.forceField && game.forceField[playerId]) parts.push('力场');
    if (game.hackActive && game.hackActive[playerId]) parts.push('骇入待触发');
    if (game.danhengCounterReady && game.danhengCounterReady[playerId]) parts.push('反击就绪');
    if (game.xilianAscensionActive && game.xilianAscensionActive[playerId]) parts.push('跃升');
    parts.push(`曜彩剩余${auroraLeft}`);
    parts.push(`A触发${aCount}`);

    return `${getPlayerName(room, playerId)}：${parts.join(' ｜ ')}`;
  }

  function buildDetailedBattleLog(room, game) {
    if (!game) return '';
    const lines = [];
    const weatherDisplay = GPP.getWeatherDisplay ? GPP.getWeatherDisplay(game) : null;
    const attackerName = getPlayerName(room, game.attackerId);
    const defenderName = getPlayerName(room, game.defenderId);

    lines.push(`第 ${game.round} 回合｜阶段：${getPhaseLabel(game.phase)}`);
    lines.push(`攻击方：${attackerName} ｜ 防守方：${defenderName} ｜ 重投剩余：${game.rerollsLeft || 0}`);

    if (weatherDisplay && weatherDisplay.name) {
      lines.push(`天气：${weatherDisplay.name} ｜ 类型：${weatherDisplay.type || '-'} ｜ ${weatherDisplay.effect}`);
    }

    if (room && Array.isArray(room.players) && room.players.length) {
      const hpLine = room.players.map((p) => {
        const hp = getMapNumber(game.hp, p.id, 0);
        const maxHp = getMapNumber(game.maxHp, p.id, hp);
        return `${sanitizeDisplayName(p.name)} ${hp}/${maxHp}`;
      });
      lines.push(`生命：${hpLine.join(' ｜ ')}`);

      const lvLine = room.players.map((p) => {
        const atk = getMapNumber(game.attackLevel, p.id, 0);
        const def = getMapNumber(game.defenseLevel, p.id, 0);
        return `${sanitizeDisplayName(p.name)} 攻${atk} 防${def}`;
      });
      lines.push(`等级：${lvLine.join(' ｜ ')}`);
    }

    lines.push('');
    lines.push('投骰详情');
    lines.push(`攻击骰池：${formatDiceLabels(game.attackDice)}`);
    lines.push(`攻击已确认：${formatSelectedDice(game.attackDice, game.attackSelection)} ｜ 攻击值：${typeof game.attackValue === 'number' ? game.attackValue : '--'}${game.attackPierce ? '（洞穿）' : ''}`);
    lines.push(`攻击预览：${formatSelectedDice(game.attackDice, game.attackPreviewSelection)}`);
    lines.push(`防御骰池：${formatDiceLabels(game.defenseDice)}`);
    lines.push(`防御已确认：${formatSelectedDice(game.defenseDice, game.defenseSelection)} ｜ 防御值：${typeof game.defenseValue === 'number' ? game.defenseValue : '--'}`);
    lines.push(`防御预览：${formatSelectedDice(game.defenseDice, game.defensePreviewSelection)}`);
    lines.push(`最终伤害：${typeof game.lastDamage === 'number' ? game.lastDamage : '--'}`);

    if (room && Array.isArray(room.players) && room.players.length) {
      lines.push('');
      lines.push('状态快照');
      room.players.forEach((p) => {
        lines.push(formatStatusLine(game, room, p.id));
      });
    }

    const logs = Array.isArray(game.log) ? game.log : [];
    if (logs.length) {
      lines.push('');
      lines.push(`战斗日志（最近 ${Math.min(logs.length, 120)} 条）`);
      const startLine = Math.max(0, logs.length - 120);
      for (let i = startLine; i < logs.length; i += 1) {
        lines.push(`${i + 1}. ${logs[i]}`);
      }
    }

    return lines.join('\n');
  }

  const PORTRAIT_NAME_ALIAS = {
    '丹恒·腾荒': '丹恒',
  };

  function sanitizeDisplayName(str) {
    if (!str) return '';
    return String(str).replace(/[\[\]【】]/g, '').trim();
  }

  function getPortraitUrl(name) {
    const sanitized = sanitizeDisplayName(name);
    if (!sanitized || sanitized === '未公开') return null;
    const fileName = PORTRAIT_NAME_ALIAS[sanitized] || sanitized;
    return `/picture/${encodeURIComponent(fileName)}.png`;
  }

  function syncHeaderVisibility() {
    if (!dom.headerRoomInfo) return;
    const inRoom = !!state.room;
    if (inRoom) {
      dom.headerRoomInfo.classList.remove('hidden');
    } else {
      dom.headerRoomInfo.classList.add('hidden');
    }
  }

  function getPhaseMessage(game, me) {
    if (!game) return '等待开局';

    if (game.status === 'ended') {
      return '本局已结束';
    }

    if (game.phase === 'attack_roll') {
      return game.attackerId === me ? '轮到你投掷攻击骰' : '等待对手投掷攻击骰';
    }

    if (game.phase === 'attack_reroll_or_select') {
      return game.attackerId === me ? '选择要重投的骰子，或确认攻击组合' : '对手正在调整攻击骰';
    }

    if (game.phase === 'defense_roll') {
      return game.defenderId === me ? '轮到你投掷防御骰' : '等待对手投掷防御骰';
    }

    if (game.phase === 'defense_select') {
      return game.defenderId === me ? '选择防御组合并确认' : '对手正在确认防御组合';
    }

    return '等待下一步操作';
  }

  function createPortrait(player) {
    const node = document.createElement('div');
    node.className = 'portrait';

    const characterName = sanitizeDisplayName(player && player.characterName);
    const portraitUrl = (player && player.portraitUrl) || getPortraitUrl(characterName);
    if (portraitUrl) {
      const img = document.createElement('img');
      img.src = portraitUrl;
      img.alt = player.name || '头像';
      img.loading = 'lazy';
      img.onerror = () => {
        if (img.parentNode === node) {
          img.remove();
          const text = document.createElement('span');
          const source = characterName || sanitizeDisplayName(player && player.name) || '?';
          text.textContent = (source.charAt(0) || '?').toUpperCase();
          node.appendChild(text);
        }
      };
      node.appendChild(img);
      return node;
    }

    const text = document.createElement('span');
    const source = characterName || sanitizeDisplayName(player && player.name) || '?';
    text.textContent = (source.trim().charAt(0) || '?').toUpperCase();
    node.appendChild(text);
    return node;
  }
  function createInfoChip(text, tone) {
    const chip = document.createElement('span');
    chip.className = `infoChip${tone ? ` ${tone}` : ''}`;
    chip.textContent = text;
    return chip;
  }

  function createActionButton(label, pendingLabel, pendingKey, disabled, onClick, className) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className || '';
    btn.textContent = state.pendingAction === pendingKey ? pendingLabel : label;
    btn.disabled = !!state.pendingAction || disabled;
    btn.onclick = onClick;
    return btn;
  }

  function formatGraceCountdown(deadline) {
    if (!deadline) return '';
    const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    return `${remain}s`;
  }

  function syncLogDrawer() {
    if (!dom.logDrawer || !dom.logToggleBtn) return;

    dom.logDrawer.classList.toggle('open', !!state.ui.logDrawerOpen);
    dom.logToggleBtn.textContent = state.ui.logDrawerOpen ? '收起战斗日志' : '展开战斗日志';
  }

  function ensureStaticBindings() {
    if (dom.logToggleBtn && !dom.logToggleBtn.dataset.bound) {
      dom.logToggleBtn.dataset.bound = '1';
      dom.logToggleBtn.onclick = () => {
        state.ui.logDrawerOpen = !state.ui.logDrawerOpen;
        syncLogDrawer();
      };
    }
  }

  function ensureWeatherAnchors() {
    if (!dom.weatherStatusCard) {
      const roomSide = document.querySelector('.roomSide');
      if (roomSide) {
        const card = document.createElement('section');
        card.id = 'weatherStatusCard';
        card.className = 'weatherStatusCard hidden';
        card.setAttribute('aria-live', 'polite');

        if (dom.lobbyControls && dom.lobbyControls.parentNode === roomSide) {
          roomSide.insertBefore(card, dom.lobbyControls);
        } else {
          roomSide.appendChild(card);
        }

        dom.weatherStatusCard = card;
      }
    }

    if (!dom.turnOwnershipCard) {
      const roomSide = document.querySelector('.roomSide');
      if (roomSide) {
        const card = document.createElement('section');
        card.id = 'turnOwnershipCard';
        card.className = 'turnOwnershipCard hidden';
        card.setAttribute('aria-live', 'polite');

        if (dom.lobbyControls && dom.lobbyControls.parentNode === roomSide) {
          roomSide.insertBefore(card, dom.lobbyControls);
        } else {
          roomSide.appendChild(card);
        }

        dom.turnOwnershipCard = card;
      }
    }

    if (!dom.weatherBanner) {
      const battleTop = document.querySelector('#gameArea .battleTop');
      if (battleTop) {
        const banner = document.createElement('div');
        banner.id = 'weatherBanner';
        banner.className = 'weatherBanner hidden';
        banner.setAttribute('aria-live', 'polite');
        battleTop.appendChild(banner);
        dom.weatherBanner = banner;
      }
    }
  }

  function renderPlayersList(room) {
    dom.playersList.innerHTML = '';
    if (!room || !room.players) return;

    room.players.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'playerItem';
      if (GPP.isMe(p.id)) li.classList.add('me');

      const top = document.createElement('div');
      top.className = 'playerItemTop';

      const left = document.createElement('div');
      left.className = 'playerIdentity';
      const previewLoadout = getLobbyLoadoutPreview(p);
      left.appendChild(createPortrait(Object.assign({}, p, { characterName: previewLoadout.characterName })));

      const labels = document.createElement('div');
      labels.className = 'playerLabelStack';

      const name = document.createElement('p');
      name.className = 'playerName';
      name.textContent = `${sanitizeDisplayName(p.name)}${GPP.isMe(p.id) ? '（你）' : ''}`;

      const loadout = document.createElement('p');
      loadout.className = 'playerLoadout';
      const charText = sanitizeDisplayName(previewLoadout.characterName);
      const auraText = sanitizeDisplayName(previewLoadout.auroraName);
      loadout.textContent = `角色：${charText} ｜ 曜彩：${auraText}`;

      const presence = document.createElement('p');
      const online = p.isOnline !== false;
      presence.className = `playerPresence ${online ? 'online' : 'offline'}`;
      if (online) {
        presence.textContent = '在线';
      } else {
        const grace = formatGraceCountdown(p.graceDeadline);
        presence.textContent = grace ? `断线保留：${grace}` : '离线';
      }

      labels.appendChild(name);
      labels.appendChild(loadout);
      labels.appendChild(presence);
      left.appendChild(labels);
      top.appendChild(left);

      li.appendChild(top);
      dom.playersList.appendChild(li);
    });
  }

  function getLobbyLoadoutPreview(player) {
    if (!player) return { characterName: '未选择', auroraName: '未选择' };
    if (!GPP.isMe(player.id)) {
      return {
        characterName: player.characterName || '未选择',
        auroraName: player.auroraDiceName || '未选择',
      };
    }

    const pendingCharacterName = state.ui.pendingCharacterId ? getCharacterNameById(state.ui.pendingCharacterId) : '';
    const characterName = player.characterName || pendingCharacterName || '未公开';

    let auroraName = player.auroraDiceName || '';
    if (!auroraName && state.ui.pendingAuroraDiceId) {
      auroraName = getAuroraNameById(state.ui.pendingAuroraDiceId);
    }
    if (!auroraName) {
      const candidateCharacterId = state.ui.pendingCharacterId || player.characterId;
      auroraName = doesCharacterNeedAurora(candidateCharacterId) ? '未公开' : '无需曜彩';
    }

    return {
      characterName,
      auroraName,
    };
  }
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSpecTokens(shortSpec) {
    const raw = String(shortSpec || '');
    const matches = raw.match(/\d+x\d+/g) || [];
    return matches.map((token) => {
      const parts = token.split('x');
      return {
        count: parts[0] || '',
        sides: parts[1] || '',
      };
    });
  }

  function formatShortSpecHtml(shortSpec) {
    const tokens = getSpecTokens(shortSpec);
    if (!tokens.length) return '';

    return tokens
      .map((token) => `<span class="specToken"><span class="specCount">${escapeHtml(token.count)}x</span><span class="specDieBox">${escapeHtml(token.sides)}</span></span>`)
      .join(' ');
  }

  function getCharacterNameById(characterId) {
    const c = state.characters[characterId];
    return c ? c.name : '未选择';
  }

  function getAuroraNameById(auroraId) {
    const a = state.auroraDice.find((d) => d.id === auroraId);
    return a ? a.name : '未选择';
  }

  function doesCharacterNeedAurora(characterId) {
    const c = state.characters[characterId];
    return !!(c && c.auroraUses > 0);
  }

  function ensurePendingLoadout(me) {
    if (!me) return;

    if (!state.ui.pendingCharacterId) {
      state.ui.pendingCharacterId = me.characterId || null;
    }

    if (state.ui.pendingAuroraDiceId === null || state.ui.pendingAuroraDiceId === undefined) {
      state.ui.pendingAuroraDiceId = me.auroraDiceId || null;
    }

    if (!doesCharacterNeedAurora(state.ui.pendingCharacterId)) {
      state.ui.pendingAuroraDiceId = null;
    }
  }

  function getLoadoutConfirmState(me) {
    const pendingCharacterId = state.ui.pendingCharacterId;
    const pendingAuroraId = state.ui.pendingAuroraDiceId;

    if (!pendingCharacterId) {
      return { canConfirm: false, reason: '请先选择角色。', needsAurora: false };
    }

    const pendingCharacter = state.characters[pendingCharacterId];
    if (!pendingCharacter) {
      return { canConfirm: false, reason: '所选角色无效，请重新选择。', needsAurora: false };
    }

    const needsAurora = pendingCharacter.auroraUses > 0;
    if (needsAurora && !pendingAuroraId) {
      return { canConfirm: false, reason: '该角色需要选择曜彩骰后才能确认。', needsAurora: true };
    }

    const hasChanged = !me
      || pendingCharacterId !== me.characterId
      || (needsAurora ? pendingAuroraId !== me.auroraDiceId : false)
      || !!state.ui.pendingDirty;

    if (!hasChanged) {
      return { canConfirm: false, reason: '当前选择与已确认内容一致。', needsAurora };
    }

    return { canConfirm: true, reason: '', needsAurora };
  }

  function renderLoadoutConfirmArea(me) {
    if (!dom.selectionSummary || !dom.confirmHint) return;

    const sideBtn = dom.confirmLoadoutBtn;
    const topBtn = document.getElementById('confirmLoadoutTopBtn');

    const pendingCharacterId = state.ui.pendingCharacterId;
    const pendingAuroraId = state.ui.pendingAuroraDiceId;
    const confirmedCharacterName = me ? (me.characterName || getCharacterNameById(me.characterId)) : '未确认';
    const confirmedAuroraName = me && me.auroraDiceId ? (me.auroraDiceName || getAuroraNameById(me.auroraDiceId)) : '未确认';

    const pendingCharacterName = pendingCharacterId ? getCharacterNameById(pendingCharacterId) : '未选择';
    const pendingNeedsAurora = doesCharacterNeedAurora(pendingCharacterId);
    const pendingAuroraName = pendingNeedsAurora
      ? (pendingAuroraId ? getAuroraNameById(pendingAuroraId) : '未选择')
      : '无需曜彩';

    const portraitUrl = getPortraitUrl(pendingCharacterName);

    dom.selectionSummary.innerHTML = `
      <div class="summaryMain">
        <p><b>待确认</b>：${escapeHtml(sanitizeDisplayName(pendingCharacterName))} ｜ 曜彩：${escapeHtml(sanitizeDisplayName(pendingAuroraName))}</p>
        <p><b>已确认</b>：${escapeHtml(sanitizeDisplayName(confirmedCharacterName))} ｜ 曜彩：${escapeHtml(sanitizeDisplayName(confirmedAuroraName))}</p>
      </div>
      <div class="summaryPortraitCluster">
        ${portraitUrl ? `<img src="${portraitUrl}" class="summaryPortraitImg" alt="Portrait">` : ''}
      </div>
    `;

    const verdict = getLoadoutConfirmState(me);

    if (verdict.canConfirm) {
      dom.confirmHint.textContent = state.ui.confirmHint || '点击确认后才会提交到房间。';
    } else {
      dom.confirmHint.textContent = verdict.reason || state.ui.confirmHint || '';
    }

    const handleConfirm = () => {
      const latest = getLoadoutConfirmState(me);
      if (!latest.canConfirm) {
        state.ui.confirmHint = latest.reason;
        GPP.render();
        return;
      }

      const pickedCharacterId = state.ui.pendingCharacterId;
      const pickedAuroraId = state.ui.pendingAuroraDiceId;
      const pickedCharacter = state.characters[pickedCharacterId];

      send('choose_character', { characterId: pickedCharacterId });
      if (pickedCharacter && pickedCharacter.auroraUses > 0 && pickedAuroraId) {
        send('choose_aurora_die', { auroraDiceId: pickedAuroraId });
      }

      state.ui.pendingDirty = false;
      state.ui.confirmHint = pickedCharacter && pickedCharacter.auroraUses > 0 && pickedAuroraId
        ? `已提交选择：${pickedCharacter.name} + ${getAuroraNameById(pickedAuroraId)}`
        : `已提交选择：${pickedCharacter ? pickedCharacter.name : '角色'}`;

      GPP.render();
    };

    if (sideBtn) {
      sideBtn.disabled = !verdict.canConfirm;
      sideBtn.textContent = '确认当前选择';
      sideBtn.onclick = handleConfirm;
    }

    if (topBtn) {
      topBtn.disabled = !verdict.canConfirm;
      topBtn.textContent = '确认当前选择';
      topBtn.onclick = handleConfirm;
      topBtn.classList.remove('hidden');
    }
  }
  function getFloatingTooltipNode() {
    let node = document.getElementById('floatingTooltip');
    if (node) return node;

    node = document.createElement('div');
    node.id = 'floatingTooltip';
    node.className = 'floatingTooltip hidden';
    document.body.appendChild(node);
    return node;
  }

  function positionFloatingTooltip(anchorRect) {
    const node = getFloatingTooltipNode();
    const gap = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    node.style.left = '-9999px';
    node.style.top = '-9999px';
    const tipRect = node.getBoundingClientRect();

    let top = anchorRect.bottom + gap;
    if (top + tipRect.height > viewportHeight - gap) {
      top = Math.max(gap, anchorRect.top - tipRect.height - gap);
    }

    let left = anchorRect.left;
    if (left + tipRect.width > viewportWidth - gap) {
      left = viewportWidth - tipRect.width - gap;
    }
    if (left < gap) left = gap;

    node.style.top = `${Math.round(top)}px`;
    node.style.left = `${Math.round(left)}px`;
  }

  function hideFloatingTooltip() {
    const node = document.getElementById('floatingTooltip');
    if (node) {
      node.classList.add('hidden');
      node.innerHTML = '';
    }
    floatingTooltipState = null;
  }

  function ensureFloatingTooltipEventsBound() {
    if (floatingTooltipEventsBound) return;
    floatingTooltipEventsBound = true;
    window.addEventListener('scroll', syncFloatingTooltipPosition, true);
    window.addEventListener('resize', syncFloatingTooltipPosition);
  }

  function syncFloatingTooltipPosition() {
    if (!floatingTooltipState || !floatingTooltipState.anchorEl) return;
    if (!document.body.contains(floatingTooltipState.anchorEl)) {
      hideFloatingTooltip();
      return;
    }
    positionFloatingTooltip(floatingTooltipState.anchorEl.getBoundingClientRect());
  }

  function showFloatingTooltip(anchorEl, html) {
    if (!anchorEl || !html) return;
    const node = getFloatingTooltipNode();
    node.innerHTML = html;
    node.classList.remove('hidden');
    floatingTooltipState = { anchorEl };
    positionFloatingTooltip(anchorEl.getBoundingClientRect());
  }

  function bindAdaptiveTooltip(wrap, tip) {
    if (!wrap || !tip || wrap.dataset.tooltipBound === '1') return;
    wrap.dataset.tooltipBound = '1';
    ensureFloatingTooltipEventsBound();

    const show = () => showFloatingTooltip(wrap, tip.innerHTML);
    wrap.addEventListener('mouseenter', show);
    wrap.addEventListener('focusin', show);
    wrap.addEventListener('mouseleave', hideFloatingTooltip);
    wrap.addEventListener('focusout', hideFloatingTooltip);
  }

  function bindGlossaryTooltipDelegation() {
    if (glossaryTooltipDelegationBound) return;
    glossaryTooltipDelegationBound = true;
    ensureFloatingTooltipEventsBound();

    document.addEventListener('mouseover', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('.glossTip') : null;
      if (!target) return;
      if (target.contains(event.relatedTarget)) return;
      const tip = target.querySelector('.glossTipText');
      if (!tip || !tip.innerHTML) return;
      showFloatingTooltip(target, tip.innerHTML);
    });

    document.addEventListener('mouseout', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('.glossTip') : null;
      if (!target) return;
      const to = event.relatedTarget;
      if (to && target.contains(to)) return;
      if (floatingTooltipState && floatingTooltipState.anchorEl === target) {
        hideFloatingTooltip();
      }
    });

    document.addEventListener('focusin', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('.glossTip') : null;
      if (!target) return;
      const tip = target.querySelector('.glossTipText');
      if (!tip || !tip.innerHTML) return;
      showFloatingTooltip(target, tip.innerHTML);
    });

    document.addEventListener('focusout', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('.glossTip') : null;
      if (!target) return;
      if (floatingTooltipState && floatingTooltipState.anchorEl === target) {
        hideFloatingTooltip();
      }
    });
  }

  function renderCharacterButtons() {
    const me = GPP.findPlayer(state.me);
    dom.characterButtons.innerHTML = '';
    if (!me) return;

    const list = Object.keys(state.characters).map((id) => state.characters[id]);
    list.forEach((c) => {
      const wrap = document.createElement('div');
      wrap.className = 'tooltipWrap';

      const btn = document.createElement('button');
      btn.className = 'selectionBtn';
      btn.type = 'button';
      btn.innerHTML = `${escapeHtml(sanitizeDisplayName(c.name))} &nbsp; ${formatShortSpecHtml(c.shortSpec)}`;
      if (me.characterId === c.id) btn.classList.add('confirmedSelection');
      if (state.ui.pendingCharacterId === c.id) btn.classList.add('pendingSelection');
      btn.onclick = () => {
        state.ui.pendingCharacterId = c.id;
        state.ui.pendingDirty = true;
        state.ui.confirmHint = '';
        if (c.auroraUses <= 0) {
          state.ui.pendingAuroraDiceId = null;
        }
        GPP.render();
      };

      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.innerHTML = `<b>${escapeHtml(sanitizeDisplayName(c.name))}</b><br>HP ${c.hp} | ${formatShortSpecHtml(c.shortSpec)}<br>技能：${escapeHtml(c.skillText)}`;
      bindAdaptiveTooltip(wrap, tip);

      wrap.appendChild(btn);
      wrap.appendChild(tip);
      dom.characterButtons.appendChild(wrap);
    });
  }

  function renderAuroraButtons() {
    const me = GPP.findPlayer(state.me);
    dom.auroraButtons.innerHTML = '';
    if (!me) return;

    const pendingCharacter = state.characters[state.ui.pendingCharacterId] || GPP.getCharacter(me.characterId);
    if (!pendingCharacter) return;

    if (pendingCharacter.auroraUses <= 0) {
      const p = document.createElement('p');
      p.className = 'lobbyHint';
      p.textContent = '当前待确认角色无需曜彩骰。';
      dom.auroraButtons.appendChild(p);
      return;
    }

    state.auroraDice.forEach((a) => {
      const wrap = document.createElement('div');
      wrap.className = 'tooltipWrap';

      const btn = document.createElement('button');
      btn.className = 'selectionBtn';
      btn.type = 'button';
      btn.textContent = `${sanitizeDisplayName(a.name)}  ${a.facesText}`;
      if (me.auroraDiceId === a.id) btn.classList.add('confirmedSelection');
      if (state.ui.pendingAuroraDiceId === a.id) btn.classList.add('pendingSelection');
      btn.onclick = () => {
        state.ui.pendingAuroraDiceId = a.id;
        state.ui.pendingDirty = true;
        state.ui.confirmHint = '';
        GPP.render();
      };

      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.innerHTML = `<b>${escapeHtml(sanitizeDisplayName(a.name))}</b><br>骰面：${escapeHtml(a.facesText)}<br>${escapeHtml(a.effectText)}<br>条件：${escapeHtml(a.conditionText)}`;
      bindAdaptiveTooltip(wrap, tip);

      wrap.appendChild(btn);
      wrap.appendChild(tip);
      dom.auroraButtons.appendChild(wrap);
    });
  }
  function renderBattleCenter(game) {
    if (!dom.battleCenterScore || !game) return;

    dom.battleCenterScore.onclick = null;
    dom.battleCenterScore.classList.remove('clickableCenter');

    if (game.attackValue !== null && game.attackValue !== undefined && game.defenseValue !== null && game.defenseValue !== undefined) {
      const diff = game.attackPierce ? game.attackValue : Math.max(0, game.attackValue - game.defenseValue);
      const tag = game.attackPierce ? '洞穿' : '差值';
      dom.battleCenterScore.textContent = `${game.attackValue} vs ${game.defenseValue}  ${tag} ${diff}`;
      return;
    }

    const phaseText = getPhaseLabel(game.phase);

    if (game.phase === 'attack_roll' && game.attackerId === state.me) {
      dom.battleCenterScore.textContent = '点击投掷攻击骰';
      dom.battleCenterScore.classList.add('clickableCenter');
      dom.battleCenterScore.onclick = () => {
        if (state.pendingAction) return;
        GPP.clearSelection();
        sendWithFeedback('roll_attack', 'roll_attack');
      };
      return;
    }

    if (game.phase === 'defense_roll' && game.defenderId === state.me) {
      dom.battleCenterScore.textContent = '点击投掷防御骰';
      dom.battleCenterScore.classList.add('clickableCenter');
      dom.battleCenterScore.onclick = () => {
        if (state.pendingAction) return;
        GPP.clearSelection();
        sendWithFeedback('roll_defense', 'roll_defense');
      };
      return;
    }

    dom.battleCenterScore.textContent = phaseText;
  }
  function getMapNumber(gameMap, playerId) {
    if (!gameMap || gameMap[playerId] === undefined || gameMap[playerId] === null) return 0;
    return gameMap[playerId];
  }

  function getAttackBonusDetails(game, playerId) {
    return {
      power: getMapNumber(game.power, playerId),
      overload: getMapNumber(game.overload, playerId),
      desperate: getMapNumber(game.desperateBonus, playerId),
    };
  }

  function getDiceByIndices(dice, indices) {
    if (!Array.isArray(dice) || !Array.isArray(indices)) return [];
    const picked = [];
    for (const idx of indices) {
      if (!Number.isInteger(idx)) continue;
      if (idx < 0 || idx >= dice.length) continue;
      if (!dice[idx]) continue;
      picked.push(dice[idx]);
    }
    return picked;
  }

  function calcDistinctPairCount(selectedDice) {
    if (!Array.isArray(selectedDice) || !selectedDice.length) return 0;
    const freq = {};
    for (const die of selectedDice) {
      const value = die && Number.isFinite(die.value) ? die.value : null;
      if (value === null) continue;
      freq[value] = (freq[value] || 0) + 1;
    }
    let pairedValues = 0;
    for (const v of Object.values(freq)) {
      if (v >= 2) pairedValues += 1;
    }
    return pairedValues;
  }

  function hasAuroraA(selectedDice, auroraId) {
    return selectedDice.some((die) => !!(die && die.isAurora && die.hasA && die.auroraId === auroraId));
  }

  function buildValueExpression(base, addTotal, mul) {
    const hasAdd = addTotal > 0;
    if (mul > 1 && hasAdd) return `(${base} + ${addTotal}) \u00D7 ${mul}`;
    if (mul > 1) return `${base} \u00D7 ${mul}`;
    if (hasAdd) return `${base} + ${addTotal}`;
    return `${base}`;
  }

  function computeRealtimeFormula(game, player, lane, selectedIndices) {
    if (!game || !player || !Array.isArray(selectedIndices) || selectedIndices.length === 0) {
      return null;
    }

    if (lane === 'attack' && game.attackerId === player.id && Array.isArray(game.attackDice)) {
      const selectedDice = getDiceByIndices(game.attackDice, selectedIndices);
      if (!selectedDice.length) return null;

      const base = selectedDice.reduce((sum, die) => sum + (Number.isFinite(die.value) ? die.value : 0), 0);
      const attackBonus = getAttackBonusDetails(game, player.id);
      const liuyingBonus = (
        player.characterId === 'liuying'
        && getMapNumber(game.hp, player.id) === getMapNumber(game.maxHp, player.id)
      ) ? 5 : 0;
      const addTotal = attackBonus.power + attackBonus.overload + attackBonus.desperate + liuyingBonus;
      const mul = (hasAuroraA(selectedDice, 'legacy') || hasAuroraA(selectedDice, 'evolution')) ? 2 : 1;
      const singleHit = (base + addTotal) * mul;

      const liuyingCombo = player.characterId === 'liuying' && calcDistinctPairCount(selectedDice) >= 2;
      const repeaterCombo = hasAuroraA(selectedDice, 'repeater');
      const comboHits = (liuyingCombo || repeaterCombo) ? 2 : 1;
      const hasDetail = addTotal > 0 || mul > 1 || comboHits > 1;

      const detailParts = [];
      if (addTotal > 0 || mul > 1) {
        detailParts.push(buildValueExpression(base, addTotal, mul));
      }
      if (comboHits > 1) {
        detailParts.push(`\u8FDE\u51FB\u00D72=${singleHit * 2}`);
      }

      return {
        primaryKind: '\u653B\u51FB',
        primaryValue: singleHit,
        detailText: detailParts.join(' \uFF5C '),
        hasDetail,
      };
    }

    if (lane === 'defense' && game.defenderId === player.id && Array.isArray(game.defenseDice)) {
      const selectedDice = getDiceByIndices(game.defenseDice, selectedIndices);
      if (!selectedDice.length) return null;

      const base = selectedDice.reduce((sum, die) => sum + (Number.isFinite(die.value) ? die.value : 0), 0);
      const shajinBonus = player.characterId === 'shajin' ? getMapNumber(game.resilience, player.id) : 0;
      const addTotal = shajinBonus;
      const mul = (hasAuroraA(selectedDice, 'legacy') || hasAuroraA(selectedDice, 'evolution')) ? 2 : 1;
      const defenseFinal = (base + addTotal) * mul;
      const hasDetail = addTotal > 0 || mul > 1;

      return {
        primaryKind: '\u9632\u5FA1',
        primaryValue: defenseFinal,
        detailText: hasDetail ? buildValueExpression(base, addTotal, mul) : '',
        hasDetail,
      };
    }

    return null;
  }

  function renderActionRail(game, me, enemy) {
    if (!dom.actionRail) return;
    dom.actionRail.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = '操作区';
    dom.actionRail.appendChild(title);

    const phaseLine = document.createElement('p');
    phaseLine.className = 'railHint';
    phaseLine.textContent = getPhaseMessage(game, state.me);
    dom.actionRail.appendChild(phaseLine);

    const infoRow = document.createElement('div');
    infoRow.className = 'railInfo';
    const myHp = me && game.hp ? game.hp[me.id] : '-';
    const enemyHp = enemy && game.hp ? game.hp[enemy.id] : '-';
    infoRow.appendChild(createInfoChip(`我方HP ${myHp}`, 'infoHpSelf'));
    infoRow.appendChild(createInfoChip(`敌方HP ${enemyHp}`, 'infoHpEnemy'));
    dom.actionRail.appendChild(infoRow);

    const actions = document.createElement('div');
    actions.className = 'railActions';

    if (game.status === 'ended') {
      const ended = document.createElement('p');
      ended.className = 'railHint';
      ended.textContent = '对局已结束，可在结算面板选择再来一局或解散房间。';
      actions.appendChild(ended);
      dom.actionRail.appendChild(actions);
      return;
    }

    if (game.phase === 'attack_roll') {
      if (game.attackerId === state.me) {
        actions.appendChild(createActionButton('投掷攻击骰', '投掷中...', 'roll_attack', false, () => {
          GPP.clearSelection();
          sendWithFeedback('roll_attack', 'roll_attack');
        }, 'primaryBtn'));
      }
    }

    if (game.phase === 'attack_reroll_or_select') {
      if (game.attackerId === state.me) {
        const needCount = GPP.getNeedCountForPhase(game, 'attack');
        const mePlayer = GPP.findPlayer(state.me);
        const meChar = mePlayer ? GPP.getCharacter(mePlayer.characterId) : null;
        const myUses = game.auroraUsesRemaining && game.auroraUsesRemaining[state.me] !== undefined
          ? game.auroraUsesRemaining[state.me]
          : 0;
        const usedThisRound = game.roundAuroraUsed && game.roundAuroraUsed[state.me];

        const hint = document.createElement('p');
        hint.className = 'railHint';
        hint.textContent = `已选 ${state.selectedDice.size}/${needCount} ｜ 剩余重投 ${game.rerollsLeft}`;
        actions.appendChild(hint);

        if (!meChar || meChar.auroraUses > 0) {
          actions.appendChild(createActionButton(
            `使用曜彩骰（${myUses}）`,
            '使用中...',
            'use_aurora_atk',
            usedThisRound || myUses <= 0,
            () => {
              GPP.clearSelection();
              sendWithFeedback('use_aurora_die', 'use_aurora_atk');
            },
            'accentBtn'
          ));
        }

        actions.appendChild(createActionButton('重投已选骰子', '重投中...', 'reroll_attack', game.rerollsLeft <= 0 || state.selectedDice.size <= 0, () => {
          const indices = [...state.selectedDice];
          GPP.clearSelection();
          sendWithFeedback('reroll_attack', 'reroll_attack', { indices });
        }, 'secondaryBtn'));

        actions.appendChild(createActionButton(`确认攻击（选${needCount}）`, '确认中...', 'confirm_attack', state.selectedDice.size !== needCount, () => {
          const indices = [...state.selectedDice];
          GPP.clearSelection();
          sendWithFeedback('confirm_attack_selection', 'confirm_attack', { indices });
        }, 'primaryBtn'));
      }
    }

    if (game.phase === 'defense_roll') {
      if (game.defenderId === state.me) {
        actions.appendChild(createActionButton('投掷防御骰', '投掷中...', 'roll_defense', false, () => {
          GPP.clearSelection();
          sendWithFeedback('roll_defense', 'roll_defense');
        }, 'primaryBtn'));
      }
    }

    if (game.phase === 'defense_select') {
      if (game.defenderId === state.me) {
        const needCount = GPP.getNeedCountForPhase(game, 'defense');
        const mePlayer = GPP.findPlayer(state.me);
        const meChar = mePlayer ? GPP.getCharacter(mePlayer.characterId) : null;
        const myUses = game.auroraUsesRemaining && game.auroraUsesRemaining[state.me] !== undefined
          ? game.auroraUsesRemaining[state.me]
          : 0;
        const usedThisRound = game.roundAuroraUsed && game.roundAuroraUsed[state.me];

        const hint = document.createElement('p');
        hint.className = 'railHint';
        hint.textContent = `已选 ${state.selectedDice.size}/${needCount}`;
        actions.appendChild(hint);

        if (!meChar || meChar.auroraUses > 0) {
          actions.appendChild(createActionButton(
            `使用曜彩骰（${myUses}）`,
            '使用中...',
            'use_aurora_def',
            usedThisRound || myUses <= 0,
            () => {
              GPP.clearSelection();
              sendWithFeedback('use_aurora_die', 'use_aurora_def');
            },
            'accentBtn'
          ));
        }

        actions.appendChild(createActionButton(`确认防御（选${needCount}）`, '确认中...', 'confirm_defense', state.selectedDice.size !== needCount, () => {
          const indices = [...state.selectedDice];
          GPP.clearSelection();
          sendWithFeedback('confirm_defense_selection', 'confirm_defense', { indices });
        }, 'primaryBtn'));
      }
    }

    if (!actions.childNodes.length) {
      const waiting = document.createElement('p');
      waiting.className = 'railHint';
      waiting.textContent = '当前没有可执行操作，等待回合推进...';
      actions.appendChild(waiting);
    }

    dom.actionRail.appendChild(actions);
  }
  function getTurnOwnership(game) {
    if (!game) return { ownerId: null, ownerType: 'neutral', label: '等待开局' };
    if (game.phase === 'attack_roll' || game.phase === 'attack_reroll_or_select') {
      const mine = game.attackerId === state.me;
      return {
        ownerId: game.attackerId,
        ownerType: mine ? 'self' : 'enemy',
        label: mine ? '当前是你的攻击回合' : '当前是对方攻击回合',
      };
    }
    if (game.phase === 'defense_roll' || game.phase === 'defense_select') {
      const mine = game.defenderId === state.me;
      return {
        ownerId: game.defenderId,
        ownerType: mine ? 'self' : 'enemy',
        label: mine ? '当前是你的防守回合' : '当前是对方防守回合',
      };
    }
    if (game.phase === 'ended' || game.status === 'ended') {
      return { ownerId: null, ownerType: 'neutral', label: '本局已结束' };
    }
    return { ownerId: null, ownerType: 'neutral', label: '等待回合推进' };
  }

  function renderTurnOwnershipCard(game) {
    if (!dom.turnOwnershipCard) return;
    const info = getTurnOwnership(game);
    dom.turnOwnershipCard.className = `turnOwnershipCard turnOwner-${info.ownerType}`;
    dom.turnOwnershipCard.innerHTML = [
      '<p class="turnOwnershipLabel">回合归属</p>',
      `<p class="turnOwnershipText">${escapeHtml(info.label)}</p>`,
    ].join('');
  }

  function renderWeatherPanels(game) {
    const weatherDisplay = GPP.getWeatherDisplay(game);
    const typeText = weatherDisplay.type === '-' ? '未生效' : weatherDisplay.type;
    const typeClass = weatherDisplay.typeClass || 'assist';
    const stageText = weatherDisplay.stageRound ? `回合${weatherDisplay.stageRound}阶段` : '开局阶段';

    if (dom.weatherStatusCard) {
      dom.weatherStatusCard.className = `weatherStatusCard weatherTypeCard-${typeClass}`;
      dom.weatherStatusCard.innerHTML = [
        '<p class="weatherStatusLabel">当前天气</p>',
        `<div class="weatherStatusHead"><h4>${escapeHtml(weatherDisplay.name)}</h4><span class="weatherTypeTag weatherType-${typeClass}">${escapeHtml(typeText)}</span></div>`,
        `<p class="weatherStatusMeta">阶段：${escapeHtml(stageText)}</p>`,
        `<p class="weatherStatusDesc">${escapeHtml(weatherDisplay.effect)}</p>`,
      ].join('');
    }

    if (dom.weatherBanner) {
      dom.weatherBanner.className = `weatherBanner weatherTypeCard-${typeClass}`;
      dom.weatherBanner.innerHTML = [
        '<span class="weatherBannerPrefix">天气</span>',
        `<span class="weatherBannerName">${escapeHtml(weatherDisplay.name)}</span>`,
        `<span class="weatherTypeTag weatherType-${typeClass}">${escapeHtml(typeText)}</span>`,
        `<span class="weatherBannerEffect">${escapeHtml(weatherDisplay.effect)}</span>`,
      ].join('');
    }
  }
  function renderPlayerZone(game, player, zoneEl, isSelf) {
    zoneEl.innerHTML = '';
    zoneEl.classList.remove('activeTurnZone');

    if (!player) {
      const empty = document.createElement('p');
      empty.className = 'zoneEmpty';
      empty.textContent = '等待玩家加入...';
      zoneEl.appendChild(empty);
      return;
    }

    if (game.phase.startsWith('attack_') && game.attackerId === player.id) {
      zoneEl.classList.add('activeTurnZone');
    } else if (game.phase.startsWith('defense_') && game.defenderId === player.id) {
      zoneEl.classList.add('activeTurnZone');
    }

    const header = document.createElement('div');
    header.className = 'zoneHeader';

    const profile = document.createElement('div');
    profile.className = 'zoneProfile';
    profile.appendChild(createPortrait(player));

    const profileText = document.createElement('div');
    const role = document.createElement('p');
    role.className = 'zoneRole';
    role.textContent = isSelf ? '我方' : '敌方';

    const name = document.createElement('h3');
    name.textContent = sanitizeDisplayName(player.name);

    profileText.appendChild(role);
    profileText.appendChild(name);
    profile.appendChild(profileText);

    const hp = document.createElement('div');
    hp.className = 'hpBadge';
    hp.setAttribute('data-player-id', player.id);
    hp.textContent = `HP ${game.hp[player.id]}`;

    const atkLevel = game.attackLevel && game.attackLevel[player.id] !== undefined ? game.attackLevel[player.id] : '-';
    const defLevel = game.defenseLevel && game.defenseLevel[player.id] !== undefined ? game.defenseLevel[player.id] : '-';
    const stats = document.createElement('div');
    stats.className = 'atkDefBox';
    stats.innerHTML = [
      `<span class="atkDefItem">攻击等级 ${atkLevel}</span>`,
      `<span class="atkDefItem">防御等级 ${defLevel}</span>`,
    ].join('');

    const statusCluster = document.createElement('div');
    statusCluster.className = 'zoneHeaderStatus';
    statusCluster.appendChild(hp);
    statusCluster.appendChild(stats);

    header.appendChild(profile);
    header.appendChild(statusCluster);
    zoneEl.appendChild(header);

    const meta = document.createElement('p');
    meta.className = 'metaLine';
    const uses = game.auroraUsesRemaining && game.auroraUsesRemaining[player.id] !== undefined
      ? game.auroraUsesRemaining[player.id]
      : 0;
    const aCount = game.auroraAEffectCount && game.auroraAEffectCount[player.id] !== undefined
      ? game.auroraAEffectCount[player.id]
      : 0;

    const charHtml = GPP.charTooltipHtml(player.characterId, sanitizeDisplayName(player.characterName));
    const auraHtml = GPP.auroraTooltipHtml(player.auroraDiceId, sanitizeDisplayName(player.auroraDiceName));
    meta.innerHTML = `角色：${charHtml} ｜ 曜彩：${auraHtml} ｜ 剩余曜彩 ${uses} ｜ A触发 ${aCount}`;
    zoneEl.appendChild(meta);

    const extras = [];
    const poison = game.poison && game.poison[player.id];
    const resilience = game.resilience && game.resilience[player.id];
    const thorns = game.thorns && game.thorns[player.id];
    if (poison > 0) extras.push(`中毒${poison}`);
    if (resilience > 0) extras.push(`韧性${resilience}`);
    if (thorns > 0) extras.push(`荆棘${thorns}`);
    if (game.forceField && game.forceField[player.id]) extras.push('力场');
    if (game.hackActive && game.hackActive[player.id]) extras.push('骇入');
    if (game.danhengCounterReady && game.danhengCounterReady[player.id]) extras.push('反击准备');
    if (game.xilianAscensionActive && game.xilianAscensionActive[player.id]) extras.push('跃升');

    if (extras.length) {
      const extraLine = document.createElement('p');
      extraLine.className = 'metaLine extraLine';
      extraLine.innerHTML = GPP.wrapGlossaryTerms(`状态：${extras.join(' ｜ ')}`);
      zoneEl.appendChild(extraLine);
    }

    const attackBonus = getAttackBonusDetails(game, player.id);
    const attackBonusParts = [];
    if (attackBonus.power > 0) attackBonusParts.push(`力量+${attackBonus.power}`);
    if (attackBonus.overload > 0) attackBonusParts.push(`超载+${attackBonus.overload}`);
    if (attackBonus.desperate > 0) attackBonusParts.push(`背水+${attackBonus.desperate}`);
    if (attackBonusParts.length) {
      const bonusLine = document.createElement('p');
      bonusLine.className = 'metaLine bonusLine';
      bonusLine.innerHTML = GPP.wrapGlossaryTerms(`攻击加成：${attackBonusParts.join(' ｜ ')}`);
      zoneEl.appendChild(bonusLine);
    }

    const detailHints = [];
    if (attackBonus.overload > 0) detailHints.push(`超载防御自伤${Math.ceil(attackBonus.overload * 0.5)}`);
    const xilianCumulative = getMapNumber(game.xilianCumulative, player.id);
    if (player.characterId === 'xilian' || xilianCumulative > 0) {
      detailHints.push(`昔涟累计${xilianCumulative}/25`);
    }
    if (detailHints.length) {
      const detailLine = document.createElement('p');
      detailLine.className = 'metaLine detailLine';
      detailLine.innerHTML = GPP.wrapGlossaryTerms(`提示：${detailHints.join(' ｜ ')}`);
      zoneEl.appendChild(detailLine);
    }

    const displayed = GPP.getDisplayedDiceForPlayer(game, player.id);
    if (!displayed) {
      const emptyDice = document.createElement('p');
      emptyDice.className = 'zoneEmpty';
      emptyDice.textContent = '等待投掷骰子...';
      zoneEl.appendChild(emptyDice);
      return;
    }

    const laneText = displayed.lane === 'attack'
      ? '\u653B\u51FB\u9AB0'
      : displayed.lane === 'attack_selected'
        ? '\u5DF2\u786E\u8BA4\u653B\u51FB\u9AB0'
        : '\u9632\u5FA1\u9AB0';

    const diceTitle = document.createElement('p');
    diceTitle.className = 'metaLine diceTitle';
    diceTitle.textContent = laneText;
    zoneEl.appendChild(diceTitle);

    const center = document.createElement('div');
    center.className = 'diceCenter';

    let clickable = false;
    let maxSelectable = 0;
    if (isSelf && game.phase === 'attack_reroll_or_select' && game.attackerId === player.id && displayed.lane === 'attack') {
      clickable = true;
      maxSelectable = null;
    }
    if (isSelf && game.phase === 'defense_select' && game.defenderId === player.id && displayed.lane === 'defense') {
      clickable = true;
      maxSelectable = GPP.getNeedCountForPhase(game, 'defense');
    }

    const preview = GPP.getPreviewSelectionForPlayer(game, player.id);
    let selectedSet = null;
    if (clickable) {
      selectedSet = state.selectedDice;
    } else if (preview) {
      selectedSet = new Set(preview.indices);
    }

    const laneLayout = document.createElement('div');
    laneLayout.className = 'diceLaneLayout';

    const diceAnchor = document.createElement('div');
    diceAnchor.className = 'diceAnchor';
    diceAnchor.appendChild(GPP.renderDice(displayed.dice, maxSelectable, clickable, selectedSet));

    const valueSide = document.createElement('div');
    valueSide.className = 'realtimeValueSide';

    const committed = GPP.getCommittedSumForPlayer(game, player.id);
    if (committed) {
      const committedKind = (
        game.attackerId === player.id
        && Array.isArray(game.attackSelection)
        && game.attackSelection.length
      ) ? '\u653B\u51FB' : '\u9632\u5FA1';

      const committedBadge = document.createElement('div');
      committedBadge.className = `sumBadge${committed && committed.pierce ? ' pierce' : ''}`;
      committedBadge.textContent = `${committedKind} ${committed.sum}`;
      valueSide.appendChild(committedBadge);
    } else {
      let realtimeData = null;
      if (clickable) {
        realtimeData = computeRealtimeFormula(game, player, displayed.lane, [...state.selectedDice]);
      } else if (preview) {
        realtimeData = computeRealtimeFormula(game, player, displayed.lane, preview.indices || []);
      }

      const realtimeBadge = document.createElement('div');
      realtimeBadge.className = 'sumBadge mainValueBadge';

      if (realtimeData) {
        realtimeBadge.textContent = `${realtimeData.primaryKind} ${realtimeData.primaryValue}`;
        valueSide.appendChild(realtimeBadge);
        if (realtimeData.hasDetail && realtimeData.detailText) {
          const detail = document.createElement('p');
          detail.className = 'realtimeFormulaDetail';
          detail.textContent = realtimeData.detailText;
          valueSide.appendChild(detail);
        }
      } else {
        realtimeBadge.textContent = '--';
        valueSide.appendChild(realtimeBadge);
      }
    }

    laneLayout.appendChild(diceAnchor);
    laneLayout.appendChild(valueSide);
    center.appendChild(laneLayout);
    zoneEl.appendChild(center);

    const hints = GPP.renderAuroraHints(displayed.dice);
    if (hints) zoneEl.appendChild(hints);
  }
  function renderHomeScene() {
    state.ui.scene = 'home';
    state.ui.logDrawerOpen = false;

    dom.connectionPanel.classList.remove('hidden');
    dom.roomPanel.classList.add('hidden');
    dom.msgPanel.classList.remove('hidden');
    if (dom.weatherStatusCard) dom.weatherStatusCard.classList.add('hidden');
    if (dom.turnOwnershipCard) dom.turnOwnershipCard.classList.add('hidden');
    if (dom.weatherBanner) dom.weatherBanner.classList.add('hidden');

    syncLogDrawer();
  }

  function renderRoomScene(room) {
    state.ui.scene = 'room';

    dom.connectionPanel.classList.add('hidden');
    dom.roomPanel.classList.remove('hidden');
    dom.msgPanel.classList.add('hidden');

    dom.roomCodeEl.textContent = room.code;
    renderPlayersList(room);

    if (!room.game || room.game.status === 'waiting') {
      dom.gameArea.classList.add('hidden');
      dom.lobbyArea.classList.remove('hidden');
      if (dom.lobbyControls) dom.lobbyControls.classList.remove('hidden');
      if (dom.weatherStatusCard) dom.weatherStatusCard.classList.add('hidden');
      if (dom.turnOwnershipCard) dom.turnOwnershipCard.classList.add('hidden');
      if (dom.weatherBanner) dom.weatherBanner.classList.add('hidden');

      const me = GPP.findPlayer(state.me);
      ensurePendingLoadout(me);
      renderPlayersList(room);
      renderCharacterButtons();
      renderAuroraButtons();
      renderLoadoutConfirmArea(me);

      dom.lobbyHint.textContent = room.waitingReason || '等待双方完成开局配置。';
      return;
    }

    const game = room.game;

    dom.lobbyArea.classList.add('hidden');
    if (dom.lobbyControls) dom.lobbyControls.classList.add('hidden');
    const topBtn = document.getElementById('confirmLoadoutTopBtn');
    if (topBtn) topBtn.classList.add('hidden');
    dom.gameArea.classList.remove('hidden');

    const attacker = GPP.findPlayer(game.attackerId);
    const defender = GPP.findPlayer(game.defenderId);
    const me = GPP.findPlayer(state.me);
    const enemy = room.players.find((p) => p.id !== state.me) || null;

    dom.roundInfo.textContent = `第${game.round}回合 ｜ ${getPhaseLabel(game.phase)}`;
    dom.turnInfo.textContent = `攻击方：${attacker ? sanitizeDisplayName(attacker.name) : '-'} ｜ 防守方：${defender ? sanitizeDisplayName(defender.name) : '-'}`;
    renderWeatherPanels(game);
    renderTurnOwnershipCard(game);

    renderPlayerZone(game, enemy, dom.enemyZone, false);
    renderPlayerZone(game, me, dom.selfZone, true);
    renderActionRail(game, me, enemy);
    renderBattleCenter(game);

    dom.logBox.textContent = buildDetailedBattleLog(room, game);

    syncLogDrawer();
  }
  function render() {
    hideFloatingTooltip();
    ensureStaticBindings();
    bindGlossaryTooltipDelegation();
    ensureWeatherAnchors();
    syncHeaderVisibility();
    GPP.hideWinnerOverlay();

    if (!state.room) {
      renderHomeScene();
      return;
    }

    renderRoomScene(state.room);

    if (state.room.game && state.room.game.status === 'ended') {
      const winner = GPP.findPlayer(state.room.game.winnerId);
      GPP.showWinnerOverlay(`恭喜${sanitizeDisplayName((winner && winner.name) || '未知玩家')}胜利`);
    }
  }

  GPP.render = render;
})();











