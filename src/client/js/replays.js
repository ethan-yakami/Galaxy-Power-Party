(function() {
  const replayHistory = window.GPPReplayHistory;
  const schema = window.GPPReplaySchema || {};
  const REPLAY_ERROR_CODES = schema.REPLAY_ERROR_CODES || {};
  const UNSUPPORTED_REPLAY_VERSION_CODE = REPLAY_ERROR_CODES.UNSUPPORTED_REPLAY_VERSION || 'UNSUPPORTED_REPLAY_VERSION';
  const RESUME_PAYLOAD_KEY = 'gpp_resume_payload_v1';

  const dom = {
    backHomeBtn: document.getElementById('backHomeBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    importReplayInput: document.getElementById('importReplayInput'),
    historyHint: document.getElementById('historyHint'),
    historyList: document.getElementById('historyList'),
    detailTitle: document.getElementById('detailTitle'),
    detailSubtitle: document.getElementById('detailSubtitle'),
    detailActions: document.getElementById('detailActions'),
    openBattleReplayBtn: document.getElementById('openBattleReplayBtn'),
    downloadReplayBtn: document.getElementById('downloadReplayBtn'),
    continueLocalBtn: document.getElementById('continueLocalBtn'),
    continueRoomBtn: document.getElementById('continueRoomBtn'),
    stepControls: document.getElementById('stepControls'),
    prevStepBtn: document.getElementById('prevStepBtn'),
    nextStepBtn: document.getElementById('nextStepBtn'),
    stepRange: document.getElementById('stepRange'),
    stepLabel: document.getElementById('stepLabel'),
    actionSummary: document.getElementById('actionSummary'),
    stepDetailView: document.getElementById('stepDetailView'),
    overview: document.getElementById('overview'),
    diceView: document.getElementById('diceView'),
    logView: document.getElementById('logView'),
    detailEmpty: document.getElementById('detailEmpty'),
  };

  const state = {
    entries: [],
    loadErrors: [],
    selectedReplayId: '',
    snapshotIndex: 0,
  };

  function fmtTime(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '-';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return '-';
    }
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setResumePayload(entry, snapshotIndex) {
    try {
      sessionStorage.setItem(RESUME_PAYLOAD_KEY, JSON.stringify({
        replay: entry.replay,
        snapshotIndex,
      }));
      return true;
    } catch {
      return false;
    }
  }

  function loadEntries() {
    if (!replayHistory) {
      state.entries = [];
      state.loadErrors = [];
      return;
    }
    state.entries = replayHistory.loadHistory();
    state.loadErrors = typeof replayHistory.getLastLoadErrors === 'function'
      ? replayHistory.getLastLoadErrors()
      : [];
  }

  function getSelectedEntry() {
    if (!state.selectedReplayId && state.entries.length) {
      state.selectedReplayId = state.entries[0].replayId;
    }
    return state.entries.find((entry) => entry.replayId === state.selectedReplayId) || null;
  }

  function getSnapshotByIndex(entry, index) {
    const snapshots = entry && entry.replay && Array.isArray(entry.replay.snapshots) ? entry.replay.snapshots : [];
    return snapshots[index] || null;
  }

  function getStepDetailByStep(entry, step) {
    const details = entry && entry.replay && Array.isArray(entry.replay.stepDetails) ? entry.replay.stepDetails : [];
    return details.find((item) => item && item.step === step) || null;
  }

  function getActionByStep(entry, step) {
    const actions = entry && entry.replay && Array.isArray(entry.replay.actions) ? entry.replay.actions : [];
    return actions.find((item) => item && item.step === step) || null;
  }

  function buildHistoryHintText() {
    const unsupported = state.loadErrors.filter((error) => error && error.errorCode === UNSUPPORTED_REPLAY_VERSION_CODE).length;
    if (!state.entries.length) {
      return unsupported > 0
        ? `当前没有可用回放，已过滤 ${unsupported} 条不兼容记录。`
        : '当前还没有回放记录，完成一局对战后会自动保存到这里。';
    }
    return unsupported > 0
      ? `已载入 ${state.entries.length} 条回放，另有 ${unsupported} 条不兼容记录已忽略。`
      : `已载入 ${state.entries.length} 条回放记录。`;
  }

  function downloadReplay(entry) {
    if (!entry) return;
    const content = JSON.stringify(entry.replay, null, 2);
    const replayId = entry.replayId || 'replay';
    const fileName = `${(schema.REPLAY_FILE_PREFIX || 'gpp-replay')}-${replayId.replace(/[^\w.-]/g, '_')}.json`;
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function openResumeBattle(mode) {
    const entry = getSelectedEntry();
    if (!entry) return;
    if (!setResumePayload(entry, state.snapshotIndex)) {
      window.alert('浏览器无法写入继续对局数据，请稍后重试。');
      return;
    }
    location.href = `/battle.html?mode=${encodeURIComponent(mode)}&name=${encodeURIComponent(`继续玩家${Math.floor(Math.random() * 1000)}`)}`;
  }

  function renderHistoryList() {
    dom.historyList.innerHTML = '';
    dom.historyHint.textContent = buildHistoryHintText();
    for (const entry of state.entries) {
      const item = document.createElement('li');
      item.className = `historyItem${entry.replayId === state.selectedReplayId ? ' active' : ''}`;
      const summary = entry.summary || {};
      item.innerHTML = [
        `<div><strong>${escapeHtml((summary.players && summary.players.join(' vs ')) || 'Unknown vs Unknown')}</strong></div>`,
        `<div class="historyLine">房间：${escapeHtml(summary.roomCode || '-')} | 胜者：${escapeHtml(summary.winner || '-')}</div>`,
        `<div class="historyLine">回合：${escapeHtml(summary.rounds || 0)} | 动作：${escapeHtml(summary.actionCount || 0)}</div>`,
        `<div class="historyLine">保存时间：${escapeHtml(fmtTime(entry.savedAt))}</div>`,
      ].join('');

      const actions = document.createElement('div');
      actions.className = 'itemActions';

      const openBtn = document.createElement('button');
      openBtn.className = 'secondaryBtn';
      openBtn.type = 'button';
      openBtn.textContent = '查看';
      openBtn.onclick = () => {
        state.selectedReplayId = entry.replayId;
        state.snapshotIndex = 0;
        render();
      };

      const replayBtn = document.createElement('button');
      replayBtn.className = 'secondaryBtn';
      replayBtn.type = 'button';
      replayBtn.textContent = '战斗页回看';
      replayBtn.onclick = () => {
        location.href = `/battle.html?mode=replay&replayId=${encodeURIComponent(entry.replayId)}`;
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'dangerBtn';
      deleteBtn.type = 'button';
      deleteBtn.textContent = '删除';
      deleteBtn.onclick = () => {
        replayHistory.removeReplayById(entry.replayId);
        if (state.selectedReplayId === entry.replayId) {
          state.selectedReplayId = '';
          state.snapshotIndex = 0;
        }
        loadEntries();
        render();
      };

      actions.appendChild(replayBtn);
      actions.appendChild(openBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      dom.historyList.appendChild(item);
    }
  }

  function renderDetail() {
    const entry = getSelectedEntry();
    if (!entry) {
      dom.detailTitle.textContent = '未选择回放';
      dom.detailSubtitle.textContent = '从左侧选择一局回放，或导入一个 JSON 文件。';
      dom.detailActions.classList.add('hidden');
      dom.stepControls.classList.add('hidden');
      dom.actionSummary.classList.add('hidden');
      dom.stepDetailView.classList.add('hidden');
      dom.overview.classList.add('hidden');
      dom.diceView.classList.add('hidden');
      dom.logView.classList.add('hidden');
      dom.detailEmpty.classList.remove('hidden');
      return;
    }

    const replay = entry.replay || {};
    const snapshots = Array.isArray(replay.snapshots) ? replay.snapshots : [];
    if (!snapshots.length) {
      dom.detailTitle.textContent = '该回放没有快照';
      dom.detailSubtitle.textContent = '这条记录不完整，可以删除后重新导入。';
      dom.detailActions.classList.add('hidden');
      dom.stepControls.classList.add('hidden');
      dom.actionSummary.classList.add('hidden');
      dom.stepDetailView.classList.add('hidden');
      dom.overview.classList.add('hidden');
      dom.diceView.classList.add('hidden');
      dom.logView.classList.add('hidden');
      dom.detailEmpty.classList.remove('hidden');
      return;
    }

    state.snapshotIndex = Math.max(0, Math.min(state.snapshotIndex, snapshots.length - 1));
    const snapshot = getSnapshotByIndex(entry, state.snapshotIndex);
    const summary = entry.summary || {};
    const detail = getStepDetailByStep(entry, snapshot.step);
    const action = getActionByStep(entry, snapshot.step);
    const view = snapshot && snapshot.view ? snapshot.view : null;

    dom.detailTitle.textContent = (summary.players && summary.players.join(' vs ')) || 'Unknown vs Unknown';
    dom.detailSubtitle.textContent = `开始：${fmtTime(summary.startedAt)} | 胜者：${summary.winner || '-'} | 回合：${summary.rounds || 0}`;
    dom.detailActions.classList.remove('hidden');
    dom.detailEmpty.classList.add('hidden');

    dom.stepControls.classList.remove('hidden');
    dom.stepRange.min = '0';
    dom.stepRange.max = String(Math.max(0, snapshots.length - 1));
    dom.stepRange.value = String(state.snapshotIndex);
    dom.stepLabel.textContent = `Step ${state.snapshotIndex}/${Math.max(0, snapshots.length - 1)}`;
    dom.prevStepBtn.disabled = state.snapshotIndex <= 0;
    dom.nextStepBtn.disabled = state.snapshotIndex >= snapshots.length - 1;

    dom.actionSummary.classList.remove('hidden');
    dom.actionSummary.innerHTML = [
      `<div><strong>快照原因：</strong>${escapeHtml(snapshot.reason || 'snapshot')}</div>`,
      `<div><strong>时间：</strong>${escapeHtml(fmtTime(snapshot.timestamp))}</div>`,
      `<div><strong>动作：</strong>${escapeHtml(action ? `${action.actionCode} (actor=${action.actor || '-'})` : '开局初始快照')}</div>`,
    ].join('');

    dom.stepDetailView.classList.remove('hidden');
    if (detail) {
      const logs = Array.isArray(detail.logsAdded) ? detail.logsAdded : [];
      const effects = Array.isArray(detail.effectsAdded) ? detail.effectsAdded : [];
      dom.stepDetailView.innerHTML = [
        `<div><strong>本步结果：</strong>${escapeHtml(detail.actionOutcome && detail.actionOutcome.ok === false ? '失败' : '成功')}</div>`,
        `<div><strong>阶段：</strong>${escapeHtml(detail.phaseBefore || '-')} -> ${escapeHtml(detail.phaseAfter || '-')}</div>`,
        `<div><strong>回合：</strong>${escapeHtml(detail.roundBefore || 0)} -> ${escapeHtml(detail.roundAfter || 0)}</div>`,
        `<div><strong>新增日志：</strong>${logs.length ? escapeHtml(logs.join(' | ')) : '无'}</div>`,
        `<div><strong>新增效果：</strong>${effects.length ? escapeHtml(JSON.stringify(effects)) : '无'}</div>`,
      ].join('');
    } else {
      dom.stepDetailView.innerHTML = '<div>这是旧版回放，已自动降级显示快照概览。</div>';
    }

    if (!view) {
      dom.overview.classList.remove('hidden');
      dom.overview.innerHTML = '<p>该步缺少可视化视图，但仍可继续导出、恢复和查看基本快照信息。</p>';
      dom.diceView.classList.add('hidden');
      dom.logView.classList.add('hidden');
      return;
    }

    const playersHtml = Array.isArray(view.players)
      ? view.players.map((player) => (
        `<div class="playerCard"><strong>${escapeHtml(player.name || player.playerId || '-')}</strong><div>HP: ${escapeHtml(player.hp)} / ${escapeHtml(player.maxHp)}</div><div>${escapeHtml(player.characterId || '-')} | ${escapeHtml(player.auroraDiceId || '-')}</div></div>`
      )).join('')
      : '';
    dom.overview.classList.remove('hidden');
    dom.overview.innerHTML = [
      `<div>回合 ${escapeHtml(view.round)} | 阶段 ${escapeHtml(view.phase)} | 状态 ${escapeHtml(view.status)}</div>`,
      `<div>攻击方 ${escapeHtml(view.attackerId || '-')} | 防守方 ${escapeHtml(view.defenderId || '-')} | 胜者 ${escapeHtml(view.winnerId || '-')}</div>`,
      `<div>攻击值 ${escapeHtml(view.attackValue)} | 防御值 ${escapeHtml(view.defenseValue)} | 上次伤害 ${escapeHtml(view.lastDamage)}</div>`,
      `<div class="overviewGrid">${playersHtml}</div>`,
    ].join('');

    const attackDice = Array.isArray(view.attackDice) ? view.attackDice.map((die) => (die && die.label ? die.label : '-')).join(' ') : '-';
    const defenseDice = Array.isArray(view.defenseDice) ? view.defenseDice.map((die) => (die && die.label ? die.label : '-')).join(' ') : '-';
    dom.diceView.classList.remove('hidden');
    dom.diceView.innerHTML = [
      `<div><strong>攻击骰：</strong><span class="mono">${escapeHtml(attackDice)}</span></div>`,
      `<div><strong>防御骰：</strong><span class="mono">${escapeHtml(defenseDice)}</span></div>`,
      `<div><strong>攻击选中：</strong>${escapeHtml((view.attackSelection || []).join(', ') || '-')}</div>`,
      `<div><strong>防御选中：</strong>${escapeHtml((view.defenseSelection || []).join(', ') || '-')}</div>`,
    ].join('');

    const logs = detail && Array.isArray(detail.logsAdded) && detail.logsAdded.length
      ? detail.logsAdded
      : (Array.isArray(view.logTail) ? view.logTail : []);
    dom.logView.classList.remove('hidden');
    dom.logView.innerHTML = logs.length
      ? logs.map((line, index) => `<div class="mono">${index + 1}. ${escapeHtml(line)}</div>`).join('')
      : '<div class="hint">该步没有日志片段。</div>';
  }

  function render() {
    renderHistoryList();
    renderDetail();
  }

  function bindEvents() {
    dom.backHomeBtn.onclick = () => { location.href = '/'; };
    dom.clearAllBtn.onclick = () => {
      replayHistory.clearHistory();
      state.entries = [];
      state.loadErrors = [];
      state.selectedReplayId = '';
      state.snapshotIndex = 0;
      render();
    };
    dom.importReplayInput.onchange = async () => {
      const file = dom.importReplayInput.files && dom.importReplayInput.files[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const entry = replayHistory.upsertReplay(parsed);
        if (!entry) {
          window.alert('导入失败：回放格式无效或版本不支持。');
        } else {
          loadEntries();
          state.selectedReplayId = entry.replayId;
          state.snapshotIndex = 0;
          render();
        }
      } catch (error) {
        window.alert(`导入失败：${error && error.message ? error.message : '未知错误'}`);
      } finally {
        dom.importReplayInput.value = '';
      }
    };
    dom.stepRange.oninput = () => {
      state.snapshotIndex = Number(dom.stepRange.value || 0);
      renderDetail();
    };
    dom.prevStepBtn.onclick = () => {
      state.snapshotIndex = Math.max(0, state.snapshotIndex - 1);
      renderDetail();
    };
    dom.nextStepBtn.onclick = () => {
      const entry = getSelectedEntry();
      const max = entry && entry.replay && Array.isArray(entry.replay.snapshots) ? entry.replay.snapshots.length - 1 : 0;
      state.snapshotIndex = Math.min(max, state.snapshotIndex + 1);
      renderDetail();
    };
    dom.downloadReplayBtn.onclick = () => downloadReplay(getSelectedEntry());
    dom.openBattleReplayBtn.onclick = () => {
      const entry = getSelectedEntry();
      if (!entry) return;
      location.href = `/battle.html?mode=replay&replayId=${encodeURIComponent(entry.replayId)}`;
    };
    dom.continueLocalBtn.onclick = () => openResumeBattle('resume_local');
    dom.continueRoomBtn.onclick = () => openResumeBattle('resume_room');
  }

  loadEntries();
  bindEvents();
  render();
})();
