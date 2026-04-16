(function() {
  const { state, dom, send, setMessage } = GPP;
  const urls = window.GPPUrls || {
    getBasePath() {
      return '/';
    },
    toPath(path) {
      return `/${String(path || '').replace(/^\/+/, '')}`;
    },
    toWsUrl(_locationRef, wsProtocol) {
      return `${wsProtocol}//${location.host}/`;
    },
  };
  const logger = GPP.logger || {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  const protocolErrors = window.GPPProtocolErrors || null;
  const isBattlePage = /\/battle\.html$/i.test(location.pathname);
  const replayHistory = window.GPPReplayHistory || null;

  const CONNECT_WELCOME_TIMEOUT_MS = 6000;
  const ROOM_ACK_TIMEOUT_MS = 8000;
  const WS_AUTH_TIMEOUT_MS = 3000;
  const RECONNECT_TOKEN_KEY = 'gpp_reconnect_token';
  const LAST_ROOM_CODE_KEY = 'gpp_last_room_code';
  const RESUME_PAYLOAD_KEY = 'gpp_resume_payload_v1';
  const ROOM_JOIN_ERROR_HINTS = Object.freeze({
    ROOM_NOT_FOUND: 'Room not found. Please verify the 4-digit room code.',
    ROOM_FULL: 'This room is full.',
    ROOM_IN_GAME: 'This room is already in game.',
    ROOM_ENDED: 'This room has already ended.',
  });

  const STATUS_META = {
    idle: { text: '未连接', className: 'statusIdle' },
    connecting: { text: '连接中', className: 'statusConnecting' },
    awaiting_welcome: { text: '等待欢迎', className: 'statusOpen' },
    resuming: { text: '恢复会话', className: 'statusWelcome' },
    ready: { text: '连接成功', className: 'statusWelcome' },
    joining_room: { text: '进入房间', className: 'statusWelcome' },
    in_room: { text: '已在房间', className: 'statusWelcome' },
    retry_wait: { text: '重连中', className: 'statusRetrying' },
    failed: { text: '连接失败', className: 'statusFailed' },
  };

  let connectWatchdogTimer = null;
  let roomAckTimer = null;
  let reconnectTimer = null;
  let wsAuthTimer = null;
  let catalogBackfillPromise = null;

  function clearTimer(handle) {
    if (handle) clearTimeout(handle);
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function storageSet(key, value) {
    try {
      if (value === null || value === undefined || value === '') {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch {}
  }

  function setLaunchHint(text) {
    if (dom.launchHint) dom.launchHint.textContent = text || '';
  }

  function getAccessToken() {
    return window.GPPAuth && typeof window.GPPAuth.getAccessToken === 'function'
      ? window.GPPAuth.getAccessToken()
      : '';
  }

  function clearWsAuthWatchdog() {
    clearTimer(wsAuthTimer);
    wsAuthTimer = null;
  }

  function maybeStartWsAuthentication() {
    clearWsAuthWatchdog();
    state.ui.wsAuthPending = false;
    state.ui.wsAuthAttempted = false;
    state.ui.wsAuthOk = false;

    const accessToken = getAccessToken();
    if (!accessToken) return false;

    state.ui.wsAuthPending = true;
    state.ui.wsAuthAttempted = true;
    send('authenticate', { accessToken });
    wsAuthTimer = setTimeout(() => {
      if (!state.ui.wsAuthPending) return;
      state.ui.wsAuthPending = false;
      state.ui.wsAuthOk = false;
      logger.warn('ws_auth_timeout', {
        hasLaunchIntent: !!state.ui.launchIntent,
      });
      if (state.ui.launchIntent && !state.ui.launchIntentConsumed && state.ui.welcomeReceived) {
        setLaunchHint('Account auth timed out, continuing as guest.');
        triggerLaunchIntent(false);
      }
    }, WS_AUTH_TIMEOUT_MS);
    return true;
  }

  function syncAuthUserFromSocket(user) {
    const authApi = window.GPPAuth;
    if (!authApi || typeof authApi.getSession !== 'function' || typeof authApi.setSession !== 'function') {
      return;
    }
    const session = authApi.getSession();
    authApi.setSession({
      accessToken: session && session.accessToken ? session.accessToken : '',
      refreshToken: session && session.refreshToken ? session.refreshToken : '',
      user: user && typeof user === 'object'
        ? user
        : (session && session.user && typeof session.user === 'object' ? session.user : null),
    });
  }

  function isJoinFailureCode(code) {
    return code === 'ROOM_NOT_FOUND'
      || code === 'ROOM_FULL'
      || code === 'ROOM_IN_GAME'
      || code === 'ROOM_ENDED';
  }

  function getJoinFailureHint(code, fallback) {
    return ROOM_JOIN_ERROR_HINTS[code] || fallback || 'Failed to join room.';
  }

  function buildWsUrl() {
    if (!location.host) {
      throw new Error('当前页面缺少 host，无法建立 WebSocket 连接。');
    }
    return new URL(urls.toWsUrl(location, GPP.wsProtocol)).toString();
  }

  function normalizeCatalogList(raw) {
    if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object');
    if (raw && typeof raw === 'object') return Object.values(raw).filter((item) => item && typeof item === 'object');
    return [];
  }

  function applyCatalogPayload(payload) {
    const nextCharacters = {};
    const characters = normalizeCatalogList(payload && payload.characters);
    for (let i = 0; i < characters.length; i += 1) {
      const character = characters[i];
      if (!character || !character.id) continue;
      nextCharacters[character.id] = character;
    }
    if (Object.keys(nextCharacters).length > 0) {
      state.characters = nextCharacters;
    }

    const auroraDice = normalizeCatalogList(payload && payload.auroraDice);
    if (auroraDice.length > 0) {
      state.auroraDice = auroraDice;
    } else if (!Array.isArray(state.auroraDice)) {
      state.auroraDice = [];
    }
  }

  function ensureCatalogBackfill() {
    if (Array.isArray(state.auroraDice) && state.auroraDice.length > 0) return;
    if (catalogBackfillPromise) return;
    if (typeof fetch !== 'function') return;

    const endpoint = urls.toPath('api/catalog');
    catalogBackfillPromise = fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`catalog_http_${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        applyCatalogPayload(payload);
        if (state.room && !state.room.game) {
          GPP.render();
        }
      })
      .catch((error) => {
        logger.warn('catalog_backfill_failed', {
          message: error && error.message ? error.message : String(error),
        });
      })
      .finally(() => {
        catalogBackfillPromise = null;
      });
  }

  function readResumePayload() {
    try {
      const raw = sessionStorage.getItem(RESUME_PAYLOAD_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const replay = parsed.replay && typeof parsed.replay === 'object' ? parsed.replay : null;
      if (!replay) return null;
      return {
        replay,
        snapshotIndex: Number.isInteger(parsed.snapshotIndex) ? parsed.snapshotIndex : undefined,
      };
    } catch {
      return null;
    }
  }

  function readReplayFromHistoryById(replayId) {
    if (!replayHistory || typeof replayHistory.loadHistory !== 'function') return null;
    const entries = replayHistory.loadHistory();
    const match = Array.isArray(entries)
      ? entries.find((entry) => entry && entry.replayId === replayId)
      : null;
    if (!match || !match.replay || typeof match.replay !== 'object') return null;
    return {
      replay: match.replay,
      snapshotIndex: undefined,
    };
  }

  function resolveResumePayload(intent) {
    const fromSession = readResumePayload();
    if (fromSession && fromSession.replay) return fromSession;
    if (intent && intent.mode === 'replay' && intent.replayId) {
      return readReplayFromHistoryById(intent.replayId);
    }
    return null;
  }

  function getReplayUiState() {
    if (!state.ui.replay) {
      state.ui.replay = {
        enabled: false,
        replayId: '',
        replay: null,
        currentIndex: 0,
      };
    }
    return state.ui.replay;
  }

  function getReplayDetailByStep(replay, step) {
    const details = replay && Array.isArray(replay.stepDetails) ? replay.stepDetails : [];
    return details.find((item) => item && item.step === step) || null;
  }

  function buildReplayPlayers(replay) {
    const loadouts = replay && Array.isArray(replay.playersLoadout) ? replay.playersLoadout : [];
    return loadouts.slice(0, 2).map((loadout, index) => {
      const playerId = loadout && loadout.playerId ? loadout.playerId : `P${index + 1}`;
      const characterId = loadout && loadout.characterId ? loadout.characterId : '';
      const auroraDiceId = loadout && loadout.auroraDiceId ? loadout.auroraDiceId : '';
      const character = state.characters[characterId] || null;
      const aurora = Array.isArray(state.auroraDice)
        ? state.auroraDice.find((item) => item && item.id === auroraDiceId) || null
        : null;
      return {
        id: playerId,
        name: loadout && loadout.name ? loadout.name : `Player ${index + 1}`,
        characterId,
        auroraDiceId,
        characterName: character ? character.name : characterId,
        auroraDiceName: aurora ? aurora.name : auroraDiceId,
        isOnline: true,
      };
    });
  }

  function buildReplayRoom(replay, snapshotIndex) {
    const replayState = getReplayUiState();
    const snapshots = replay && Array.isArray(replay.snapshots) ? replay.snapshots : [];
    const safeIndex = Math.max(0, Math.min(snapshotIndex || 0, Math.max(0, snapshots.length - 1)));
    const snapshot = snapshots[safeIndex] || null;
    const view = snapshot && snapshot.view && typeof snapshot.view === 'object' ? snapshot.view : {};
    const detail = snapshot ? getReplayDetailByStep(replay, snapshot.step) : null;
    const players = buildReplayPlayers(replay);
    const logs = detail && Array.isArray(detail.logsAdded) && detail.logsAdded.length
      ? detail.logsAdded.slice()
      : (Array.isArray(view.logTail) ? view.logTail.slice() : []);

    replayState.currentIndex = safeIndex;
    return {
      code: replay && replay.roomMeta && replay.roomMeta.roomCode ? replay.roomMeta.roomCode : 'REPLAY',
      roomMode: 'replay',
      status: view && view.status === 'ended' ? 'ended' : 'in_game',
      players,
      game: Object.assign({
        status: view.status || 'in_game',
        round: Number.isFinite(view.round) ? view.round : 0,
        phase: typeof view.phase === 'string' && view.phase ? view.phase : 'ended',
        attackerId: view.attackerId || null,
        defenderId: view.defenderId || null,
        winnerId: view.winnerId || null,
        attackValue: Number.isFinite(view.attackValue) ? view.attackValue : null,
        defenseValue: Number.isFinite(view.defenseValue) ? view.defenseValue : null,
        lastDamage: Number.isFinite(view.lastDamage) ? view.lastDamage : null,
        attackDice: Array.isArray(view.attackDice) ? view.attackDice : [],
        defenseDice: Array.isArray(view.defenseDice) ? view.defenseDice : [],
        attackSelection: Array.isArray(view.attackSelection) ? view.attackSelection : [],
        defenseSelection: Array.isArray(view.defenseSelection) ? view.defenseSelection : [],
        attackPreviewSelection: [],
        defensePreviewSelection: [],
        attackLevel: view.attackLevel && typeof view.attackLevel === 'object' ? view.attackLevel : {},
        defenseLevel: view.defenseLevel && typeof view.defenseLevel === 'object' ? view.defenseLevel : {},
        hp: view.hp && typeof view.hp === 'object' ? view.hp : {},
        maxHp: players.reduce((acc, player) => {
          const viewPlayer = Array.isArray(view.players)
            ? view.players.find((item) => item && item.playerId === player.id)
            : null;
          acc[player.id] = viewPlayer && Number.isFinite(viewPlayer.maxHp) ? viewPlayer.maxHp : null;
          return acc;
        }, {}),
        auroraUsesRemaining: view.auroraUsesRemaining && typeof view.auroraUsesRemaining === 'object' ? view.auroraUsesRemaining : {},
        selectedFourCount: view.selectedFourCount && typeof view.selectedFourCount === 'object' ? view.selectedFourCount : {},
        selectedOneCount: view.selectedOneCount && typeof view.selectedOneCount === 'object' ? view.selectedOneCount : {},
        overload: view.overload && typeof view.overload === 'object' ? view.overload : {},
        desperateBonus: view.desperateBonus && typeof view.desperateBonus === 'object' ? view.desperateBonus : {},
        auroraAEffectCount: view.auroraAEffectCount && typeof view.auroraAEffectCount === 'object' ? view.auroraAEffectCount : {},
        roundAuroraUsed: view.roundAuroraUsed && typeof view.roundAuroraUsed === 'object' ? view.roundAuroraUsed : {},
        forceField: view.forceField && typeof view.forceField === 'object' ? view.forceField : {},
        whiteeGuardUsed: view.whiteeGuardUsed && typeof view.whiteeGuardUsed === 'object' ? view.whiteeGuardUsed : {},
        whiteeGuardActive: view.whiteeGuardActive && typeof view.whiteeGuardActive === 'object' ? view.whiteeGuardActive : {},
        unyielding: view.unyielding && typeof view.unyielding === 'object' ? view.unyielding : {},
        counterActive: view.counterActive && typeof view.counterActive === 'object' ? view.counterActive : {},
        weather: view.weather && typeof view.weather === 'object' ? view.weather : null,
        poison: view.poison && typeof view.poison === 'object' ? view.poison : {},
        resilience: view.resilience && typeof view.resilience === 'object' ? view.resilience : {},
        thorns: view.thorns && typeof view.thorns === 'object' ? view.thorns : {},
        power: view.power && typeof view.power === 'object' ? view.power : {},
        hackActive: view.hackActive && typeof view.hackActive === 'object' ? view.hackActive : {},
        danhengCounterReady: view.danhengCounterReady && typeof view.danhengCounterReady === 'object' ? view.danhengCounterReady : {},
        xilianCumulative: view.xilianCumulative && typeof view.xilianCumulative === 'object' ? view.xilianCumulative : {},
        xilianAscensionActive: view.xilianAscensionActive && typeof view.xilianAscensionActive === 'object' ? view.xilianAscensionActive : {},
        yaoguangRerollsUsed: view.yaoguangRerollsUsed && typeof view.yaoguangRerollsUsed === 'object' ? view.yaoguangRerollsUsed : {},
        pendingActorId: null,
        pendingActionKind: null,
        pendingActionLabel: null,
        isAiThinking: false,
        rerollsLeft: 0,
        effectEvents: [],
        pendingWeatherChanged: null,
        log: logs,
      }, view),
    };
  }

  function applyReplaySnapshot(nextIndex) {
    const replayState = getReplayUiState();
    const replay = replayState.replay;
    if (!replay) return false;
    const room = buildReplayRoom(replay, nextIndex);
    state.room = room;
    state.me = room.players[0] ? room.players[0].id : state.me;
    state.pendingAction = null;
    state.battleActions = null;
    GPP.clearSelection();
    GPP.render();
    return true;
  }

  function bindReplayControls() {
    if (dom.replayPrevBtn && !dom.replayPrevBtn.dataset.bound) {
      dom.replayPrevBtn.dataset.bound = '1';
      dom.replayPrevBtn.onclick = () => {
        const replayState = getReplayUiState();
        applyReplaySnapshot((replayState.currentIndex || 0) - 1);
      };
    }
    if (dom.replayNextBtn && !dom.replayNextBtn.dataset.bound) {
      dom.replayNextBtn.dataset.bound = '1';
      dom.replayNextBtn.onclick = () => {
        const replayState = getReplayUiState();
        applyReplaySnapshot((replayState.currentIndex || 0) + 1);
      };
    }
    if (dom.replayStepRange && !dom.replayStepRange.dataset.bound) {
      dom.replayStepRange.dataset.bound = '1';
      dom.replayStepRange.oninput = () => {
        applyReplaySnapshot(Number(dom.replayStepRange.value || 0));
      };
    }
  }

  function initializeReplayViewer(intent) {
    const payload = intent && intent.replayId
      ? readReplayFromHistoryById(intent.replayId)
      : readResumePayload();
    if (!payload || !payload.replay) {
      const hint = '未找到可回看的回放记录，请先从回放页选择一条记录。';
      getReplayUiState().enabled = false;
      setLaunchHint(hint);
      setMessage(hint);
      setConnectionUi('failed', '回放数据缺失。', hint);
      return false;
    }

    const replay = payload.replay;
    const snapshots = Array.isArray(replay.snapshots) ? replay.snapshots : [];
    if (!snapshots.length) {
      const hint = '这条回放没有可用快照，无法在战斗页查看。';
      getReplayUiState().enabled = false;
      setLaunchHint(hint);
      setMessage(hint);
      setConnectionUi('failed', '回放快照为空。', hint);
      return false;
    }

    const replayState = getReplayUiState();
    replayState.enabled = true;
    replayState.replayId = replay.replayId || (intent && intent.replayId) || '';
    replayState.replay = replay;
    replayState.currentIndex = Number.isInteger(payload.snapshotIndex) ? payload.snapshotIndex : 0;
    state.ui.launchIntentConsumed = true;
    state.ui.connection.error = '';
    bindReplayControls();
    applyReplaySnapshot(replayState.currentIndex);
    setLaunchHint('当前正在查看只读回放，可通过下方时间轴切换步骤。');
    setMessage('已进入回放查看模式。');
    setConnectionUi('ready', '回放已加载。', '');
    try {
      sessionStorage.removeItem(RESUME_PAYLOAD_KEY);
    } catch {}
    return true;
  }

  function parseLaunchIntent() {
    if (!isBattlePage) return { intent: null, error: '' };

    const params = new URLSearchParams(location.search);
    const mode = String(params.get('mode') || '').trim();
    if (!mode) {
      return { intent: null, error: '未检测到启动参数，请从启动台打开战斗页。' };
    }
    if (!['create', 'join', 'ai', 'resume_room', 'resume_local', 'replay'].includes(mode)) {
      return { intent: null, error: `启动参数 mode 无效：${mode}` };
    }

    const rawName = String(params.get('name') || '').trim();
    const name = (rawName || `玩家${Math.floor(Math.random() * 1000)}`).slice(0, 20);
    if (mode === 'join') {
      const code = String(params.get('code') || '').trim();
      if (!/^\d{4}$/.test(code)) {
        return { intent: null, error: '加入房间参数无效，code 必须是 4 位数字。' };
      }
      return { intent: { mode, name, code }, error: '' };
    }

    if (mode === 'replay') {
      const replayId = String(params.get('replayId') || '').trim();
      return { intent: { mode, name, replayId }, error: '' };
    }

    return { intent: { mode, name }, error: '' };
  }

  function normalizeLoadout(player) {
    return {
      characterId: (player && player.characterId) || '',
      auroraDiceId: (player && player.auroraDiceId) || '',
    };
  }

  function normalizeDraft() {
    return {
      characterId: state.ui.pendingCharacterId || '',
      auroraDiceId: state.ui.pendingAuroraDiceId || '',
    };
  }

  function loadoutsMatch(left, right) {
    return !!left && !!right
      && (left.characterId || '') === (right.characterId || '')
      && (left.auroraDiceId || '') === (right.auroraDiceId || '');
  }

  function resetLobbyDraft() {
    state.ui.pendingCharacterId = null;
    state.ui.pendingAuroraDiceId = null;
    state.ui.pendingDirty = false;
    state.ui.loadoutSubmitting = false;
    state.ui.submittedLoadout = null;
    state.ui.confirmHint = '';
  }

  function finalizeLoadoutSubmission(loadout) {
    state.ui.pendingCharacterId = (loadout && loadout.characterId) || '';
    state.ui.pendingAuroraDiceId = (loadout && loadout.auroraDiceId) || '';
    state.ui.pendingDirty = false;
    state.ui.loadoutSubmitting = false;
    state.ui.submittedLoadout = null;
  }

  function maybeRequestReplayExport(room) {
    if (!room || !room.game) return;
    const ended = room.game.status === 'ended' || room.game.phase === 'ended';
    if (!ended) {
      state.ui.autoReplayExportRequested = false;
      return;
    }
    if (state.ui.autoReplayExportRequested) return;
    state.ui.autoReplayExportRequested = true;
    send('export_replay', {});
  }

  function renderConnectionStateUI() {
    if (!isBattlePage) return;

    const status = state.ui.connection.status;
    const meta = STATUS_META[status] || STATUS_META.idle;
    if (dom.connectionStatusBadge) {
      dom.connectionStatusBadge.textContent = meta.text;
      dom.connectionStatusBadge.classList.remove(
        'statusIdle',
        'statusConnecting',
        'statusOpen',
        'statusWelcome',
        'statusRetrying',
        'statusFailed'
      );
      dom.connectionStatusBadge.classList.add(meta.className);
    }

    if (dom.connectionDetail) {
      dom.connectionDetail.textContent = state.ui.connection.detail || '等待连接状态更新。';
    }

    if (dom.connectionError) {
      const hasError = !!state.ui.connection.error;
      dom.connectionError.textContent = state.ui.connection.error || '';
      dom.connectionError.classList.toggle('hidden', !hasError);
    }

    if (dom.reconnectBtn) {
      const showReconnect = status === 'failed' || status === 'retry_wait';
      dom.reconnectBtn.classList.toggle('hidden', !showReconnect);
      dom.reconnectBtn.disabled = status === 'connecting' || status === 'awaiting_welcome';
    }

    if (dom.retryIntentBtn) {
      const hasIntent = !!state.ui.launchIntent;
      const showRetryIntent = status === 'failed' && hasIntent;
      dom.retryIntentBtn.classList.toggle('hidden', !showRetryIntent);
      dom.retryIntentBtn.disabled = !showRetryIntent;
    }

    if (dom.backToLauncherInlineBtn) {
      const showBack = !state.room && (status === 'failed' || !!state.ui.launchIntentError);
      dom.backToLauncherInlineBtn.classList.toggle('hidden', !showBack);
    }
  }

  function setConnectionUi(status, detail, errorText) {
    if (status) state.ui.connection.status = status;
    if (detail !== undefined) state.ui.connection.detail = detail || '';
    if (errorText !== undefined) state.ui.connection.error = errorText || '';
    renderConnectionStateUI();
  }

  function clearRoomAckWatchdog() {
    clearTimer(roomAckTimer);
    roomAckTimer = null;
    state.ui.roomAckPending = false;
  }

  function startRoomAckWatchdog() {
    clearRoomAckWatchdog();
    state.ui.roomAckPending = true;
    roomAckTimer = setTimeout(() => {
      if (!state.ui.roomAckPending) return;
      state.ui.launchIntentConsumed = false;
      setConnectionUi('failed', '房间回执超时。', '已连接但未收到房间状态，请点击重试。');
      setMessage('房间回执超时，请重试自动入房。');
      setLaunchHint('房间回执超时，请重试自动入房。');
    }, ROOM_ACK_TIMEOUT_MS);
  }

  function clearWelcomeWatchdog() {
    clearTimer(connectWatchdogTimer);
    connectWatchdogTimer = null;
  }

  function startWelcomeWatchdog() {
    clearWelcomeWatchdog();
    connectWatchdogTimer = setTimeout(() => {
      if (state.ui.welcomeReceived) return;
      const timeoutReason = '连接超时，未收到服务端欢迎消息。';
      setMessage(timeoutReason);
      setLaunchHint(timeoutReason);
      setConnectionUi('failed', '连接超时。', timeoutReason);
      try {
        if (GPP.ws) GPP.ws.close();
      } catch {}
    }, CONNECT_WELCOME_TIMEOUT_MS);
  }

  function triggerLaunchIntent(force) {
    if (!isBattlePage) return;
    const intent = state.ui.launchIntent;
    if (!intent) return;
    if (state.ui.launchIntentConsumed && !force) return;

    if (!GPP.ws || GPP.ws.readyState !== WebSocket.OPEN || !state.ui.welcomeReceived) {
      setConnectionUi('failed', '连接尚未就绪。', '请先点击“重新连接”后重试自动入房。');
      return;
    }

    if (intent.mode === 'create') {
      setLaunchHint('已连接，正在创建房间...');
      setMessage('已连接，正在创建房间...');
      setConnectionUi('joining_room', '正在创建房间...', '');
      state.ui.launchIntentConsumed = true;
      startRoomAckWatchdog();
      send('create_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'ai') {
      setLaunchHint('已连接，正在创建 AI 对战房间...');
      setMessage('已连接，正在创建 AI 对战房间...');
      setConnectionUi('joining_room', '正在创建 AI 对战房间...', '');
      state.ui.launchIntentConsumed = true;
      startRoomAckWatchdog();
      send('create_ai_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'resume_room' || intent.mode === 'resume_local' || intent.mode === 'replay') {
      const payload = resolveResumePayload(intent);
      if (!payload || !payload.replay) {
        const hint = '未找到可恢复的回放快照，请先在回放页选择一条记录。';
        setLaunchHint(hint);
        setMessage(hint);
        setConnectionUi('failed', '恢复数据缺失。', hint);
        return;
      }
      const resumeMode = intent.mode === 'replay' ? 'resume_local' : intent.mode;
      const launchText = resumeMode === 'resume_local'
        ? '正在根据快照恢复本地续战...'
        : '正在根据快照恢复房间...';
      setLaunchHint(launchText);
      setMessage(launchText);
      setConnectionUi('joining_room', launchText, '');
      state.ui.launchIntentConsumed = true;
      startRoomAckWatchdog();
      send('create_resume_room', {
        name: intent.name,
        mode: resumeMode,
        replay: payload.replay,
        snapshotIndex: Number.isInteger(payload.snapshotIndex) ? payload.snapshotIndex : undefined,
      });
      try {
        sessionStorage.removeItem(RESUME_PAYLOAD_KEY);
      } catch {}
      return;
    }

    setLaunchHint(`已连接，正在加入房间 ${intent.code}...`);
    setMessage(`已连接，正在加入房间 ${intent.code}...`);
    setConnectionUi('joining_room', `正在加入房间 ${intent.code}...`, '');
    state.ui.launchIntentConsumed = true;
    startRoomAckWatchdog();
    send('join_room', { name: intent.name, code: intent.code });
  }

  function tryResumeSession() {
    const roomCode = storageGet(LAST_ROOM_CODE_KEY);
    const storedToken = storageGet(RECONNECT_TOKEN_KEY);
    const reconnectToken = (roomCode && storedToken)
      ? storedToken
      : (state.ui.reconnectToken || storedToken);
    if (!roomCode || !reconnectToken) return false;
    state.ui.resumePending = true;
    setLaunchHint(`检测到历史房间 ${roomCode}，正在尝试恢复会话...`);
    setMessage(`检测到历史房间 ${roomCode}，正在尝试恢复会话...`);
    setConnectionUi('resuming', '正在恢复会话...', '');
    send('resume_session', { roomCode, reconnectToken });
    startRoomAckWatchdog();
    return true;
  }

  function scheduleReconnect(waitMs) {
    clearTimer(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect('retrying');
    }, waitMs);
  }

  function openSocket(url) {
    try {
      return new WebSocket(url);
    } catch (error) {
      const reason = `WebSocket 构造失败：${error && error.message ? error.message : String(error)}`;
      setMessage(reason);
      setLaunchHint(reason);
      setConnectionUi('failed', '连接地址无效或被浏览器阻止。', reason);
      return null;
    }
  }

  function connect(mode) {
    const wsUrl = buildWsUrl();
    clearTimer(reconnectTimer);
    logger.info('socket_connect_requested', { mode, wsUrl });
    setConnectionUi('connecting', mode === 'retrying' ? '正在重新建立连接...' : '正在建立连接...', '');

    state.ui.socketToken += 1;
    const token = state.ui.socketToken;
    state.ui.welcomeReceived = false;
    state.ui.wsAuthPending = false;
    state.ui.wsAuthAttempted = false;
    state.ui.wsAuthOk = false;
    clearWsAuthWatchdog();

    const ws = openSocket(wsUrl);
    if (!ws) return;
    GPP.ws = ws;

    ws.onopen = () => {
      if (token !== state.ui.socketToken) return;
      logger.info('socket_opened', { mode, token });
      state.ui.welcomeReceived = false;
      setConnectionUi('awaiting_welcome', '连接已建立，正在等待服务端欢迎消息。', '');
      setMessage('已连接服务器。');
      setLaunchHint('连接已建立，等待欢迎消息...');
      startWelcomeWatchdog();
    };

    ws.onerror = () => {
      if (token !== state.ui.socketToken) return;
      logger.warn('socket_error', { mode, token });
      setConnectionUi(state.ui.connection.status, state.ui.connection.detail, '网络异常或浏览器阻止了连接。');
    };

    ws.onclose = () => {
      if (token !== state.ui.socketToken) return;
      logger.warn('socket_closed', {
        token,
        roomCode: state.room && state.room.code ? state.room.code : null,
      });
      clearWelcomeWatchdog();
      clearRoomAckWatchdog();
      clearWsAuthWatchdog();
      state.ui.welcomeReceived = false;
      state.ui.wsAuthPending = false;
      if (state.ui.suppressNextClose) {
        state.ui.suppressNextClose = false;
        return;
      }
      const currentDelay = Math.max(1000, Math.min(state.ui.reconnectDelay || 1000, GPP.MAX_RECONNECT_DELAY || 15000));
      const nextDelay = Math.max(1000, Math.min(Math.floor(currentDelay * 1.8), GPP.MAX_RECONNECT_DELAY || 15000));
      state.ui.reconnectDelay = nextDelay;
      setMessage(`连接已断开，${Math.max(1, Math.round(currentDelay / 1000))} 秒后自动重连...`);
      setConnectionUi('retry_wait', `连接已断开，${Math.max(1, Math.round(currentDelay / 1000))} 秒后自动重连...`, state.ui.connection.error);
      scheduleReconnect(currentDelay);
    };

    ws.onmessage = (event) => {
      if (token !== state.ui.socketToken) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        setMessage('收到无法解析的消息。');
        return;
      }

      if (msg.type === 'welcome') {
        logger.info('welcome_received', {
          playerId: msg.playerId,
          protocolVersion: msg.meta && msg.meta.protocolVersion ? msg.meta.protocolVersion : null,
        });
        clearWelcomeWatchdog();
        state.me = msg.playerId;
        state.battleActions = null;
        const freshReconnectToken = typeof msg.reconnectToken === 'string' ? msg.reconnectToken : '';
        state.ui.reconnectToken = freshReconnectToken || state.ui.reconnectToken || '';
        applyCatalogPayload(msg);
        ensureCatalogBackfill();
        if (dom.myIdEl) {
          dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
        }

        state.ui.welcomeReceived = true;
        state.ui.reconnectDelay = 1000;
        if (freshReconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, freshReconnectToken);
        }

        const authPending = maybeStartWsAuthentication();
        if (state.ui.launchIntent) {
          if (authPending) {
            setConnectionUi('ready', '连接成功，正在验证账号状态。', '');
            setMessage('连接成功，正在验证账号状态...');
            setLaunchHint('验证账号后将自动执行入房。');
          } else {
            setConnectionUi('ready', '连接成功，准备自动入房。', '');
            setMessage('连接成功，准备自动入房...');
            triggerLaunchIntent(false);
          }
        } else if (!tryResumeSession()) {
          const notice = state.ui.launchIntentError || '连接成功。请从启动台打开战斗页。';
          setConnectionUi('ready', '连接成功，等待手动操作。', state.ui.launchIntentError || '');
          setMessage(notice);
          setLaunchHint(notice);
        }
        return;
      }

      if (msg.type === 'auth_state') {
        clearWsAuthWatchdog();
        state.ui.wsAuthPending = false;
        state.ui.wsAuthOk = msg.ok === true;
        if (msg.ok === true) {
          syncAuthUserFromSocket(msg.user);
          logger.info('ws_auth_succeeded', {
            hasUser: !!(msg.user && typeof msg.user === 'object'),
          });
        } else {
          logger.warn('ws_auth_failed', {
            reason: msg.reason || 'unknown',
          });
        }

        if (state.ui.launchIntent && !state.ui.launchIntentConsumed && state.ui.welcomeReceived) {
          if (msg.ok !== true) {
            setLaunchHint(`账号鉴权失败（${msg.reason || 'unknown'}），将以游客模式继续。`);
          }
          triggerLaunchIntent(false);
        }
        return;
      }

      if (msg.type === 'room_state') {
        state.pendingAction = null;
        const prevRoomCode = state.room && state.room.code;
        const prevHadGame = !!(state.room && state.room.game);
        const nextRoomCode = msg.room && msg.room.code;

        state.room = msg.room;
        if (state.room && state.room.code) {
          storageSet(LAST_ROOM_CODE_KEY, state.room.code);
        }

        if (prevRoomCode !== nextRoomCode) {
          resetLobbyDraft();
        }

        const mePlayer = state.room && state.room.players
          ? state.room.players.find((player) => player.id === state.me)
          : null;
        if (mePlayer) {
          const serverLoadout = normalizeLoadout(mePlayer);
          const submittedLoadout = state.ui.submittedLoadout;
          const draftLoadout = normalizeDraft();
          const serverConfirmed = !!mePlayer.auroraSelectionConfirmed;
          const roomAlreadyStarted = !!state.room.game;
          const submittedMatched = !!(submittedLoadout && loadoutsMatch(serverLoadout, submittedLoadout));
          const draftMatched = loadoutsMatch(serverLoadout, draftLoadout);

          if (state.ui.loadoutSubmitting && (roomAlreadyStarted || (submittedMatched && serverConfirmed))) {
            finalizeLoadoutSubmission(serverLoadout);
          } else if (!state.ui.pendingDirty && !state.ui.loadoutSubmitting) {
            state.ui.pendingCharacterId = serverLoadout.characterId;
            state.ui.pendingAuroraDiceId = serverLoadout.auroraDiceId;
          } else if (draftMatched && serverConfirmed) {
            finalizeLoadoutSubmission(serverLoadout);
          }
        }

        clearRoomAckWatchdog();
        state.ui.resumePending = false;
        state.ui.launchIntentConsumed = !!state.room;

        maybeRequestReplayExport(state.room);

        if (!state.room.game) {
          state.battleActions = null;
          GPP.clearSelection();
          state.lastProcessedEffectId = 0;
          state.ui.autoReplayExportRequested = false;
        } else if (state.room.game.phase === 'attack_reroll_or_select' && state.room.game.attackerId === state.me) {
          GPP.setSelection(state.room.game.attackPreviewSelection || []);
        } else if (state.room.game.phase === 'defense_select' && state.room.game.defenderId === state.me) {
          GPP.setSelection(state.room.game.defensePreviewSelection || []);
        } else {
          GPP.clearSelection();
        }

        setConnectionUi('in_room', '已进入房间，连接稳定。', '');
        if (isBattlePage && dom.launchHint && state.room) {
          const launchHint = state.room.game
            ? `已进入房间 ${state.room.code}，对战进行中。`
            : (state.room.roomMode === 'ai'
              ? `已进入 AI 房间 ${state.room.code}，请选择角色与曜彩骰后点击“开始对战”。`
              : `已进入房间 ${state.room.code}，请完成大厅配置。`);
          setLaunchHint(launchHint);
        }

        try {
          GPP.render();
        } catch (error) {
          const reason = `界面渲染失败：${error && error.message ? error.message : String(error)}`;
          setMessage(reason);
          if (dom.connectionError) {
            dom.connectionError.textContent = reason;
            dom.connectionError.classList.remove('hidden');
          }
        }

        if (typeof GPP.processEffectEvents === 'function') {
          GPP.processEffectEvents(state.room.game || {}, prevRoomCode === state.room.code && prevHadGame);
        }
        return;
      }

      if (msg.type === 'battle_actions') {
        state.battleActions = msg;
        GPP.render();
        return;
      }

      if (msg.type === 'replay_export') {
        try {
          const replay = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          const entry = replayHistory && typeof replayHistory.upsertReplay === 'function'
            ? replayHistory.upsertReplay(replay)
            : null;
          if (entry) {
            GPP.showErrorToast('本局回放已自动保存到对局回放。');
          }
        } catch (error) {
          GPP.showErrorToast(`回放保存失败：${error && error.message ? error.message : String(error)}`);
        }
        return;
      }

      if (msg.type === 'session_resumed') {
        clearRoomAckWatchdog();
        state.ui.resumePending = false;
        if (msg.playerId) {
          state.me = msg.playerId;
          if (dom.myIdEl) dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
        }
        if (msg.roomCode) storageSet(LAST_ROOM_CODE_KEY, msg.roomCode);
        const savedToken = storageGet(RECONNECT_TOKEN_KEY);
        if (savedToken) state.ui.reconnectToken = savedToken;
        setConnectionUi('in_room', '会话恢复成功。', '');
        setMessage('已恢复到断线前房间。');
        return;
      }

      if (msg.type === 'session_resume_failed') {
        clearRoomAckWatchdog();
        state.ui.resumePending = false;
        storageSet(LAST_ROOM_CODE_KEY, '');
        if (state.ui.reconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, state.ui.reconnectToken);
        }
        setConnectionUi('ready', '历史会话恢复失败，将尝试常规入房。', '');
        setMessage(`会话恢复失败：${msg.reason || 'unknown'}`);
        if (state.ui.launchIntent) {
          triggerLaunchIntent(false);
        }
        return;
      }

      if (msg.type === 'player_presence_changed') {
        if (state.room && state.room.code === msg.roomCode && Array.isArray(state.room.players)) {
          const target = state.room.players.find((player) => player.id === msg.playerId);
          if (target) {
            target.isOnline = msg.isOnline !== false;
            target.disconnectedAt = msg.disconnectedAt || null;
            target.graceDeadline = msg.graceDeadline || null;
            GPP.render();
          }
        }
        return;
      }

      if (msg.type === 'weather_changed') {
        const weatherPayload = msg.weather || null;
        if (typeof GPP.getWeatherDisplay === 'function' && typeof GPP.showWeatherBroadcast === 'function') {
          const display = GPP.getWeatherDisplay({
            round: Number.isInteger(msg.round) ? msg.round : (state.room && state.room.game ? state.room.game.round : 1),
            weather: weatherPayload,
          });
          GPP.showWeatherBroadcast(display);
        }
        return;
      }

      if (msg.type === 'left_room') {
        state.pendingAction = null;
        state.room = null;
        state.battleActions = null;
        GPP.clearSelection();
        state.lastProcessedEffectId = 0;
        state.ui.autoReplayExportRequested = false;
        resetLobbyDraft();
        storageSet(LAST_ROOM_CODE_KEY, '');
        clearRoomAckWatchdog();
        state.ui.launchIntentConsumed = false;
        GPP.render();

        const reason = msg.reason || '你已退出房间。';
        setMessage(reason);
        setLaunchHint(reason);
        setConnectionUi('ready', '已离开房间。', '');
        GPP.showErrorToast(reason);
        return;
      }

      if (msg.type === 'error') {
        state.pendingAction = null;
        state.ui.loadoutSubmitting = false;
        state.ui.submittedLoadout = null;
        const descriptor = protocolErrors && typeof protocolErrors.getErrorDescriptor === 'function'
          ? protocolErrors.getErrorDescriptor(msg.code)
          : null;
        logger[descriptor && descriptor.severity === 'error' ? 'error' : 'warn']('protocol_error_received', {
          code: msg.code || 'INTERNAL_ERROR',
          category: descriptor ? descriptor.category : (msg.category || 'internal'),
          severity: descriptor ? descriptor.severity : (msg.severity || 'error'),
          message: msg.message || '',
        });
        const errorText = `错误：${msg.message}`;
        setMessage(errorText);

        const joinFailure = !state.room && isJoinFailureCode(msg.code);
        if (joinFailure) {
          clearRoomAckWatchdog();
          state.ui.launchIntentConsumed = false;
          const joinHint = getJoinFailureHint(msg.code, msg.message || errorText);
          setLaunchHint(joinHint);
          setConnectionUi('failed', '加入房间失败。', joinHint);
        } else if (state.ui.welcomeReceived && GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
          setConnectionUi(state.room ? 'in_room' : 'ready', state.ui.connection.detail || '连接稳定。', '');
        } else {
          setConnectionUi('failed', '服务端返回错误。', msg.message || errorText);
        }
        GPP.showErrorToast(msg.message || '发生错误');
        GPP.render();
        return;
      }

      if (msg.type === 'characters_updated') {
        applyCatalogPayload(msg);
        GPP.render();
      }
    };
  }

  state.ui.connectionMachine = null;
  state.ui.connection.status = 'idle';
  state.ui.suppressNextClose = false;
  state.ui.reconnectDelay = 1000;
  state.ui.wsAuthPending = false;
  state.ui.wsAuthAttempted = false;
  state.ui.wsAuthOk = false;

  const parsed = state.ui.launchIntentBootstrapped
    ? {
      intent: state.ui.launchIntent || null,
      error: state.ui.launchIntentError || '',
    }
    : parseLaunchIntent();
  state.ui.launchIntent = parsed.intent;
  state.ui.launchIntentError = parsed.error;

  if (dom.leaveBtn) {
    dom.leaveBtn.onclick = () => {
      GPP.clearSelection();
      send('leave_room');
    };
  }

  if (dom.docBtn) {
    dom.docBtn.onclick = () => GPP.showDocModal();
  }

  if (dom.createVariantBtn) {
    dom.createVariantBtn.onclick = () => GPP.showCustomCharacterModal();
  }

  if (dom.weatherGuideBtn) {
    dom.weatherGuideBtn.onclick = () => GPP.showGuideModal('weather');
  }

  if (dom.backToLauncherBtn) {
    dom.backToLauncherBtn.onclick = () => {
      location.href = urls.getBasePath(location);
    };
  }

  if (dom.backToLauncherInlineBtn) {
    dom.backToLauncherInlineBtn.onclick = () => {
      location.href = urls.getBasePath(location);
    };
  }

  if (dom.reconnectBtn) {
    dom.reconnectBtn.onclick = () => {
      state.ui.suppressNextClose = true;
      try {
        if (GPP.ws) GPP.ws.close();
      } catch {}
      state.ui.launchIntentConsumed = false;
      connect('manual_reconnect');
    };
  }

  if (dom.retryIntentBtn) {
    dom.retryIntentBtn.onclick = () => {
      if (GPP.ws && GPP.ws.readyState === WebSocket.OPEN && state.ui.welcomeReceived) {
        triggerLaunchIntent(true);
      } else {
        connect('retrying');
      }
    };
  }

  if (isBattlePage) {
    if (state.ui.launchIntent) {
      setLaunchHint('正在建立连接并自动进入战斗房间...');
    } else {
      const reason = state.ui.launchIntentError || '未检测到有效启动参数，请从启动台进入。';
      setLaunchHint(reason);
      setConnectionUi('failed', '无法自动进入房间。', reason);
      setMessage(reason);
    }
  }

  renderConnectionStateUI();
  if (state.ui.launchIntent && state.ui.launchIntent.mode === 'replay') {
    initializeReplayViewer(state.ui.launchIntent);
    GPP.render();
    return;
  }
  connect('initial');
  GPP.render();
})();
