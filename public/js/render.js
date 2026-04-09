(function() {
  const { state, dom, send, sendWithFeedback } = GPP;

  const PHASE_LABELS = {
    attack_roll: '攻击投掷',
    attack_reroll_or_select: '攻击调整',
    defense_roll: '防守投掷',
    defense_select: '防守选择',
    ended: '结算',
  };

  function getPhaseLabel(phase) {
    return PHASE_LABELS[phase] || phase;
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
      return game.defenderId === me ? '轮到你投掷防守骰' : '等待对手投掷防守骰';
    }

    if (game.phase === 'defense_select') {
      return game.defenderId === me ? '选择防守组合并确认' : '对手正在确认防守组合';
    }

    return '等待下一步操作';
  }

  function createPortrait(player) {
    const node = document.createElement('div');
    node.className = 'portrait';

    const portraitUrl = player && (player.portraitUrl || null);
    if (portraitUrl) {
      const img = document.createElement('img');
      img.src = portraitUrl;
      img.alt = player.name || '头像';
      node.appendChild(img);
      return node;
    }

    const text = document.createElement('span');
    const source = (player && (player.characterName || player.name)) || '?';
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
      left.appendChild(createPortrait(p));

      const labels = document.createElement('div');
      labels.className = 'playerLabelStack';

      const name = document.createElement('p');
      name.className = 'playerName';
      name.textContent = `${p.name}${GPP.isMe(p.id) ? '（你）' : ''}`;

      const loadout = document.createElement('p');
      loadout.className = 'playerLoadout';
      const charText = p.characterName || '未公开';
      const auraText = p.auroraDiceName || (GPP.isMe(p.id) ? '未装备' : '未公开');
      loadout.textContent = `角色：${charText}｜曜彩：${auraText}`;

      labels.appendChild(name);
      labels.appendChild(loadout);
      left.appendChild(labels);
      top.appendChild(left);

      li.appendChild(top);
      dom.playersList.appendChild(li);
    });
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
    if (!dom.selectionSummary || !dom.confirmLoadoutBtn || !dom.confirmHint) return;

    const pendingCharacterId = state.ui.pendingCharacterId;
    const pendingAuroraId = state.ui.pendingAuroraDiceId;
    const confirmedCharacterName = me ? (me.characterName || getCharacterNameById(me.characterId)) : '未确认';
    const confirmedAuroraName = me && me.auroraDiceId ? (me.auroraDiceName || getAuroraNameById(me.auroraDiceId)) : '未确认';

    const pendingCharacterName = pendingCharacterId ? getCharacterNameById(pendingCharacterId) : '未选择';
    const pendingNeedsAurora = doesCharacterNeedAurora(pendingCharacterId);
    const pendingAuroraName = pendingNeedsAurora
      ? (pendingAuroraId ? getAuroraNameById(pendingAuroraId) : '未选择')
      : '无需曜彩';

    dom.selectionSummary.innerHTML = [
      `<p><b>待确认</b>：角色 ${escapeHtml(pendingCharacterName)} ｜ 曜彩 ${escapeHtml(pendingAuroraName)}</p>`,
      `<p><b>已确认</b>：角色 ${escapeHtml(confirmedCharacterName)} ｜ 曜彩 ${escapeHtml(confirmedAuroraName)}</p>`,
    ].join('');

    const verdict = getLoadoutConfirmState(me);
    dom.confirmLoadoutBtn.disabled = !verdict.canConfirm;
    dom.confirmLoadoutBtn.textContent = verdict.canConfirm ? '确认当前选择' : '确认当前选择';

    if (verdict.canConfirm) {
      dom.confirmHint.textContent = state.ui.confirmHint || '点击确认后才会提交到房间。';
    } else {
      dom.confirmHint.textContent = verdict.reason || state.ui.confirmHint || '';
    }

    dom.confirmLoadoutBtn.onclick = () => {
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
      btn.innerHTML = `${escapeHtml(c.name)} · ${formatShortSpecHtml(c.shortSpec)}`;
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
      tip.innerHTML = `<b>${escapeHtml(c.name)}</b><br>HP ${c.hp} | ${formatShortSpecHtml(c.shortSpec)}<br>技能：${escapeHtml(c.skillText)}`;

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
      btn.textContent = `${a.name} · ${a.facesText}`;
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
      tip.innerHTML = `<b>${a.name}</b><br>骰面：${a.facesText}<br>${a.effectText}<br>条件：${a.conditionText}`;

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
      dom.battleCenterScore.textContent = `${game.attackValue} : ${game.defenseValue} · ${tag} ${diff}`;
      return;
    }

    let phaseText = getPhaseLabel(game.phase);
    
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
      dom.battleCenterScore.textContent = '点击投掷防守骰';
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
        hint.textContent = `已选 ${state.selectedDice.size}/${needCount} · 剩余重投 ${game.rerollsLeft}`;
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
        actions.appendChild(createActionButton('投掷防守骰', '投掷中...', 'roll_defense', false, () => {
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

        actions.appendChild(createActionButton(`确认防守（选${needCount}）`, '确认中...', 'confirm_defense', state.selectedDice.size !== needCount, () => {
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

  function renderWeatherPanels(game) {
    const weatherDisplay = GPP.getWeatherDisplay(game);
    const typeText = weatherDisplay.type === '-' ? '未生效' : weatherDisplay.type;
    const typeClass = weatherDisplay.typeClass || 'assist';
    const stageText = weatherDisplay.stageRound ? `回合${weatherDisplay.stageRound}阶段` : '开局阶段';

    if (dom.weatherStatusCard) {
      dom.weatherStatusCard.innerHTML = [
        '<p class="weatherStatusLabel">当前天气</p>',
        `<div class="weatherStatusHead"><h4>${escapeHtml(weatherDisplay.name)}</h4><span class="weatherTypeTag weatherType-${typeClass}">${escapeHtml(typeText)}</span></div>`,
        `<p class="weatherStatusMeta">阶段：${escapeHtml(stageText)}</p>`,
        `<p class="weatherStatusDesc">${escapeHtml(weatherDisplay.effect)}</p>`,
      ].join('');
      dom.weatherStatusCard.classList.remove('hidden');
    }

    if (dom.weatherBanner) {
      dom.weatherBanner.innerHTML = [
        '<span class="weatherBannerPrefix">天气</span>',
        `<span class="weatherBannerName">${escapeHtml(weatherDisplay.name)}</span>`,
        `<span class="weatherTypeTag weatherType-${typeClass}">${escapeHtml(typeText)}</span>`,
        `<span class="weatherBannerEffect">${escapeHtml(weatherDisplay.effect)}</span>`,
      ].join('');
      dom.weatherBanner.classList.remove('hidden');
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
    name.textContent = player.name;

    profileText.appendChild(role);
    profileText.appendChild(name);
    profile.appendChild(profileText);

    const hp = document.createElement('div');
    hp.className = 'hpBadge';
    hp.setAttribute('data-player-id', player.id);
    hp.textContent = `HP ${game.hp[player.id]}`;

    header.appendChild(profile);
    header.appendChild(hp);
    zoneEl.appendChild(header);

    const stats = document.createElement('div');
    stats.className = 'atkDefBox';
    const atkLevel = game.attackLevel && game.attackLevel[player.id] !== undefined ? game.attackLevel[player.id] : '-';
    const defLevel = game.defenseLevel && game.defenseLevel[player.id] !== undefined ? game.defenseLevel[player.id] : '-';
    stats.textContent = `攻击等级 ${atkLevel} · 防守等级 ${defLevel}`;
    zoneEl.appendChild(stats);

    const meta = document.createElement('p');
    meta.className = 'metaLine';
    const uses = game.auroraUsesRemaining && game.auroraUsesRemaining[player.id] !== undefined
      ? game.auroraUsesRemaining[player.id]
      : 0;
    const aCount = game.auroraAEffectCount && game.auroraAEffectCount[player.id] !== undefined
      ? game.auroraAEffectCount[player.id]
      : 0;

    const charHtml = GPP.charTooltipHtml(player.characterId, player.characterName);
    const auraHtml = GPP.auroraTooltipHtml(player.auroraDiceId, player.auroraDiceName);
    meta.innerHTML = `角色：${charHtml} ｜ 曜彩：${auraHtml} ｜ 剩余曜彩 ${uses} ｜ A触发 ${aCount}`;
    zoneEl.appendChild(meta);

    const extras = [];
    const poison = game.poison && game.poison[player.id];
    const resilience = game.resilience && game.resilience[player.id];
    const thorns = game.thorns && game.thorns[player.id];
    const power = game.power && game.power[player.id];
    if (poison > 0) extras.push(`中毒${poison}`);
    if (resilience > 0) extras.push(`韧性${resilience}`);
    if (thorns > 0) extras.push(`荆棘${thorns}`);
    if (power > 0) extras.push(`力量${power}`);
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

    const displayed = GPP.getDisplayedDiceForPlayer(game, player.id);
    if (!displayed) {
      const emptyDice = document.createElement('p');
      emptyDice.className = 'zoneEmpty';
      emptyDice.textContent = '等待投掷骰子...';
      zoneEl.appendChild(emptyDice);
      return;
    }

    const laneText = displayed.lane === 'attack'
      ? '攻击骰'
      : displayed.lane === 'attack_selected'
        ? '已确认攻击骰'
        : '防守骰';

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

    const wrap = document.createElement('div');
    wrap.className = 'diceRowWrap';
    wrap.appendChild(GPP.renderDice(displayed.dice, maxSelectable, clickable, selectedSet));

    const committed = GPP.getCommittedSumForPlayer(game, player.id);
    const sumBadge = document.createElement('div');
    sumBadge.className = `sumBadge${committed && committed.pierce ? ' pierce' : ''}`;

    if (committed) {
      sumBadge.textContent = `${committed.kind} ${committed.sum}`;
    } else if (clickable) {
      const liveSum = GPP.sumSelectedIndices(displayed.dice, [...state.selectedDice]);
      sumBadge.textContent = `实时 ${liveSum}`;
    } else if (preview) {
      sumBadge.textContent = `实时 ${preview.sum}`;
    } else {
      sumBadge.textContent = '--';
    }

    wrap.appendChild(sumBadge);
    center.appendChild(wrap);
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
      if (dom.weatherBanner) dom.weatherBanner.classList.add('hidden');

      const me = GPP.findPlayer(state.me);
      ensurePendingLoadout(me);
      renderCharacterButtons();
      renderAuroraButtons();
      renderLoadoutConfirmArea(me);

      dom.lobbyHint.textContent = room.waitingReason || '等待双方完成开局配置。';
      return;
    }

    const game = room.game;

    dom.lobbyArea.classList.add('hidden');
    if (dom.lobbyControls) dom.lobbyControls.classList.add('hidden');
    dom.gameArea.classList.remove('hidden');

    const attacker = GPP.findPlayer(game.attackerId);
    const defender = GPP.findPlayer(game.defenderId);
    const me = GPP.findPlayer(state.me);
    const enemy = room.players.find((p) => p.id !== state.me) || null;

    dom.roundInfo.textContent = `第 ${game.round} 回合 · ${getPhaseLabel(game.phase)}`;
    dom.turnInfo.textContent = `攻击方：${attacker ? attacker.name : '-'} ｜ 防守方：${defender ? defender.name : '-'}`;
    renderWeatherPanels(game);

    renderPlayerZone(game, enemy, dom.enemyZone, false);
    renderPlayerZone(game, me, dom.selfZone, true);
    renderActionRail(game, me, enemy);
    renderBattleCenter(game);

    dom.logBox.textContent = (game.log || []).slice(-80).join('\n');

    syncLogDrawer();
  }

  function render() {
    ensureStaticBindings();
    ensureWeatherAnchors();
    GPP.hideWinnerOverlay();

    if (!state.room) {
      renderHomeScene();
      return;
    }

    renderRoomScene(state.room);

    if (state.room.game && state.room.game.status === 'ended') {
      const winner = GPP.findPlayer(state.room.game.winnerId);
      GPP.showWinnerOverlay(`恭喜${(winner && winner.name) || '未知玩家'}胜利`);
    }
  }

  GPP.render = render;
})();
