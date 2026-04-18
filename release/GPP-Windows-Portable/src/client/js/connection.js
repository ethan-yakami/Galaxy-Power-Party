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
  const connectionMachine = window.GPPConnectionStateMachine || null;
  const launchFlowApi = window.GPPConnectionLaunchFlow || {
    ensureLaunchFlow(uiState) {
      if (!uiState.launchFlow || typeof uiState.launchFlow !== 'object') {
        uiState.launchFlow = {
          originalIntent: null,
          roomRequestSent: false,
          roomAckReceived: false,
          lastError: '',
          retryCount: 0,
        };
      }
      return uiState.launchFlow;
    },
    rememberLaunchIntent(uiState, intent) {
      const flow = this.ensureLaunchFlow(uiState);
      const nextIntent = intent && typeof intent === 'object' ? JSON.parse(JSON.stringify(intent)) : null;
      flow.originalIntent = nextIntent;
      flow.roomRequestSent = false;
      flow.roomAckReceived = false;
      flow.lastError = '';
      flow.retryCount = 0;
      uiState.launchIntent = nextIntent;
      uiState.launchIntentConsumed = false;
      return flow;
    },
    resetLaunchRequest(uiState, errorText) {
      const flow = this.ensureLaunchFlow(uiState);
      if (flow.roomRequestSent || errorText) {
        flow.retryCount += 1;
      }
      flow.roomRequestSent = false;
      flow.roomAckReceived = false;
      flow.lastError = errorText || flow.lastError || '';
      return flow;
    },
    markLaunchRequestSent(uiState) {
      const flow = this.ensureLaunchFlow(uiState);
      flow.roomRequestSent = true;
      flow.roomAckReceived = false;
      flow.lastError = '';
      return flow;
    },
    markLaunchAckReceived(uiState) {
      const flow = this.ensureLaunchFlow(uiState);
      flow.roomRequestSent = false;
      flow.roomAckReceived = true;
      flow.lastError = '';
      return flow;
    },
    clearLaunchFlow(uiState) {
      const flow = this.ensureLaunchFlow(uiState);
      flow.originalIntent = null;
      flow.roomRequestSent = false;
      flow.roomAckReceived = false;
      flow.lastError = '';
      flow.retryCount = 0;
      uiState.launchIntent = null;
      uiState.launchIntentConsumed = false;
      return flow;
    },
  };
  const messageRouterApi = window.GPPConnectionMessageRouter || {
    createMessageRouter(handlers, options) {
      const routeTable = handlers && typeof handlers === 'object' ? handlers : {};
      const onUnknown = options && typeof options.onUnknown === 'function' ? options.onUnknown : null;
      return (message, context) => {
        if (!message || typeof message !== 'object') return false;
        const type = typeof message.type === 'string' ? message.type : '';
        const handler = type ? routeTable[type] : null;
        if (typeof handler === 'function') {
          return handler(message, context) !== false;
        }
        if (onUnknown) {
          return onUnknown(message, context) !== false;
        }
        return false;
      };
    },
  };
  const isBattlePage = /\/battle(?:-next)?\.html$/i.test(location.pathname);
  const replayHistory = window.GPPReplayHistory || null;

  const CONNECT_WELCOME_TIMEOUT_MS = 6000;
  const ROOM_ACK_TIMEOUT_MS = 8000;
  const WS_AUTH_TIMEOUT_MS = 3000;
  const RECONNECT_TOKEN_KEY = 'gpp_reconnect_token';
  const LAST_ROOM_CODE_KEY = 'gpp_last_room_code';
  const RESUME_PAYLOAD_KEY = 'gpp_resume_payload_v1';
  const ROOM_JOIN_ERROR_HINTS = Object.freeze({
    ROOM_NOT_FOUND: '房间不存在，可能已失效或离线保留时间已结束。',
    ROOM_RESERVED: '房主或玩家正在重连，请稍后再试。',
    ROOM_FULL: '房间已满，请换个房间或稍后再试。',
    ROOM_IN_GAME: '房间已经开打，当前无法加入。',
    ROOM_ENDED: '房间已结束，请重新创建或加入其他房间。',
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

  function markStartupTiming(key) {
    if (typeof GPP.markStartupTiming === 'function') {
      return GPP.markStartupTiming(key);
    }
    return 0;
  }

  function markAppTiming(key) {
    if (typeof GPP.markAppTiming === 'function') {
      return GPP.markAppTiming(key);
    }
    return 0;
  }

  function maybeLogStartupTiming(reason, extra) {
    if (typeof GPP.logStartupTimingSummary === 'function') {
      GPP.logStartupTimingSummary(reason, extra || {});
    }
  }

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

  function getLaunchFlow() {
    return launchFlowApi.ensureLaunchFlow(state.ui);
  }

  function rememberLaunchIntent(intent) {
    launchFlowApi.rememberLaunchIntent(state.ui, intent);
  }

  function resetLaunchRequest(errorText) {
    launchFlowApi.resetLaunchRequest(state.ui, errorText);
  }

  function markLaunchRequestSent() {
    launchFlowApi.markLaunchRequestSent(state.ui);
  }

  function markLaunchAckReceived() {
    launchFlowApi.markLaunchAckReceived(state.ui);
  }

  function clearLaunchFlowState() {
    launchFlowApi.clearLaunchFlow(state.ui);
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
        setLaunchHint('账号同步超时，先按游客模式继续连接。');
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
      || code === 'ROOM_RESERVED'
      || code === 'ROOM_FULL'
      || code === 'ROOM_IN_GAME'
      || code === 'ROOM_ENDED';
  }

  function getJoinFailureHint(code, fallback) {
    return ROOM_JOIN_ERROR_HINTS[code] || fallback || '加入房间失败。';
  }

  function isEmbeddedShell() {
    try {
      return !!(window.parent && window.parent !== window);
    } catch {
      return false;
    }
  }

  function notifyShell(type, extra) {
    if (!isEmbeddedShell()) return;
    try {
      window.parent.postMessage({ type, ...(extra || {}) }, location.origin || '*');
    } catch {}
  }

  function resetOptimisticState() {
    state.ui.optimisticRoomActive = false;
  }

  function createOptimisticPlayer(id, name, isAi) {
    return {
      id,
      name: name || (isAi ? 'AI' : '玩家'),
      isOnline: true,
      characterId: null,
      auroraDiceId: null,
      auroraSelectionConfirmed: false,
      characterName: '',
      auroraDiceName: '',
      ws: isAi ? { isAI: true } : null,
    };
  }

  function buildOptimisticRoom(intent) {
    const players = [
      createOptimisticPlayer(state.me || 'PENDING_ME', intent.name || '玩家', false),
    ];
    let code = '----';
    let roomMode = 'standard';
    if (intent.mode === 'ai') {
      roomMode = 'ai';
      players.push(createOptimisticPlayer('AI', 'AI', true));
    } else if (intent.mode === 'join') {
      code = intent.code || '----';
      players.push(createOptimisticPlayer('PENDING_OPPONENT', '等待对手...', false));
    } else if (intent.mode === 'resume_local') {
      roomMode = 'resume_local';
    } else if (intent.mode === 'resume_room') {
      roomMode = 'resume_room';
    }
    return {
      code,
      status: 'lobby',
      roomMode,
      game: null,
      players,
      optimistic: true,
    };
  }

  function showOptimisticRoom(intent) {
    if (!intent) return;
    state.room = buildOptimisticRoom(intent);
    state.battleActions = null;
    state.pendingAction = null;
    state.ui.optimisticRoomActive = true;
    state.ui.resumePending = false;
    if (intent.mode === 'join') {
      setConnectionUi('joining_room', `正在加入房间 ${intent.code}...`, '');
      setLaunchHint(`正在加入房间 ${intent.code}...`);
      setMessage(`正在加入房间 ${intent.code}...`);
    } else if (intent.mode === 'ai') {
      setConnectionUi('joining_room', '正在创建 AI 房间...', '');
      setLaunchHint('正在创建 AI 房间...');
      setMessage('正在创建 AI 房间...');
    } else if (intent.mode === 'resume_room' || intent.mode === 'resume_local') {
      setConnectionUi('joining_room', '正在恢复房间...', '');
      setLaunchHint('正在恢复房间...');
      setMessage('正在恢复房间...');
    } else {
      setConnectionUi('joining_room', '正在创建房间...', '');
      setLaunchHint('正在创建房间...');
      setMessage('正在创建房间...');
    }
    notifyShell('gpp:battle-shell-show');
    try {
      GPP.render();
    } catch {}
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

  const routeLowRiskMessages = messageRouterApi.createMessageRouter({
    battle_actions(msg) {
      state.battleActions = msg;
      GPP.render();
      return true;
    },
    player_presence_changed(msg) {
      if (state.room && state.room.code === msg.roomCode && Array.isArray(state.room.players)) {
        const target = state.room.players.find((player) => player.id === msg.playerId);
        if (target) {
          target.isOnline = msg.isOnline !== false;
          target.disconnectedAt = msg.disconnectedAt || null;
          target.graceDeadline = msg.graceDeadline || null;
          GPP.render();
        }
      }
      return true;
    },
    weather_changed(msg) {
      const weatherPayload = msg.weather || null;
      if (typeof GPP.getWeatherDisplay === 'function' && typeof GPP.showWeatherBroadcast === 'function') {
        const display = GPP.getWeatherDisplay({
          round: Number.isInteger(msg.round) ? msg.round : (state.room && state.room.game ? state.room.game.round : 1),
          weather: weatherPayload,
        });
        GPP.showWeatherBroadcast(display);
      }
      return true;
    },
    characters_updated(msg) {
      applyCatalogPayload(msg);
      GPP.render();
      return true;
    },
  }, {
    onUnknown() {
      return false;
    },
  });

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
      const hasIntent = !!(state.ui.launchIntent || getLaunchFlow().originalIntent);
      const showRetryIntent = (status === 'failed' || status === 'retry_wait') && hasIntent;
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

  function ensureConnectionMachineState() {
    if (!connectionMachine || typeof connectionMachine.createInitialState !== 'function') {
      return null;
    }
    if (!state.ui.connectionMachineState || typeof state.ui.connectionMachineState !== 'object') {
      state.ui.connectionMachineState = connectionMachine.createInitialState({
        reconnectDelayMs: state.ui.reconnectDelay || 1000,
        maxReconnectDelayMs: GPP.MAX_RECONNECT_DELAY || 15000,
      });
    }
    return state.ui.connectionMachineState;
  }

  function dispatchConnectionEvent(event, payload) {
    if (!connectionMachine || typeof connectionMachine.transition !== 'function' || !event) {
      return null;
    }
    const current = ensureConnectionMachineState() || connectionMachine.createInitialState({
      reconnectDelayMs: state.ui.reconnectDelay || 1000,
      maxReconnectDelayMs: GPP.MAX_RECONNECT_DELAY || 15000,
    });
    const result = connectionMachine.transition(current, event, payload || {});
    if (result && result.state) {
      state.ui.connectionMachineState = result.state;
    }
    state.ui.connectionMachineLastEvent = {
      event,
      at: Date.now(),
      payload: payload || {},
      status: result && result.state ? result.state.status : null,
    };
    return result;
  }

  function clearRoomAckWatchdog() {
    clearTimer(roomAckTimer);
    roomAckTimer = null;
    state.ui.roomAckPending = false;
  }

  function failPendingLaunch(detail, errorText) {
    clearRoomAckWatchdog();
    dispatchConnectionEvent(
      connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.WATCHDOG_TIMEOUT : 'WATCHDOG_TIMEOUT',
      { kind: 'room_ack' }
    );
    state.ui.resumePending = false;
    state.ui.launchIntentConsumed = false;
    resetLaunchRequest(errorText || detail || 'room_ack_timeout');
    if (state.ui.optimisticRoomActive) {
      state.room = null;
      resetOptimisticState();
    }
    setConnectionUi('failed', detail, errorText || detail);
    setMessage(detail);
    setLaunchHint(errorText || detail);
    try {
      GPP.render();
    } catch {}
  }

  function startRoomAckWatchdog() {
    clearRoomAckWatchdog();
    state.ui.roomAckPending = true;
    roomAckTimer = setTimeout(() => {
      if (!state.ui.roomAckPending) return;
      failPendingLaunch(
        '房间响应超时，请重试自动入房。',
        '服务端未在预期时间内返回房间状态。'
      );
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
      dispatchConnectionEvent(
        connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.WATCHDOG_TIMEOUT : 'WATCHDOG_TIMEOUT',
        { kind: 'welcome' }
      );
      const timeoutReason = '连接超时，未收到服务端欢迎消息。';
      setMessage(timeoutReason);
      setLaunchHint(timeoutReason);
      setConnectionUi('failed', '连接超时。', timeoutReason);
      try {
        if (GPP.ws) GPP.ws.close();
      } catch {}
    }, CONNECT_WELCOME_TIMEOUT_MS);
  }

  function getSavedResumeCredentials() {
    const roomCode = storageGet(LAST_ROOM_CODE_KEY);
    const storedToken = storageGet(RECONNECT_TOKEN_KEY);
    const reconnectToken = roomCode
      ? (storedToken || state.ui.reconnectToken || '')
      : '';
    return { roomCode, reconnectToken };
  }

  function shouldAttemptResumeOnWelcome() {
    const saved = getSavedResumeCredentials();
    if (!saved.roomCode || !saved.reconnectToken) return false;
    const flow = getLaunchFlow();
    if (state.room && state.room.code === saved.roomCode) return true;
    if (state.ui.connection.status === 'retry_wait') return true;
    if (state.ui.resumePending) return true;
    if (flow.roomAckReceived) return true;
    return !state.ui.launchIntent;
  }

  function triggerLaunchIntent(force) {
    if (!isBattlePage) return;
    const flow = getLaunchFlow();
    const intent = state.ui.launchIntent || flow.originalIntent;
    if (!intent) return;
    if (flow.roomRequestSent && !force) return;

    if (!GPP.ws || GPP.ws.readyState !== WebSocket.OPEN || !state.ui.welcomeReceived) {
      setConnectionUi('failed', '连接尚未就绪。', '请先点击“重新连接”后重试自动入房。');
      return;
    }

    showOptimisticRoom(intent);
    markLaunchRequestSent();
    state.ui.launchIntentConsumed = true;
    dispatchConnectionEvent(
      connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.INTENT_RETRY : 'INTENT_RETRY',
      { roomAckTimeoutMs: ROOM_ACK_TIMEOUT_MS }
    );
    markStartupTiming('launch_intent_dispatched_at');
    markAppTiming('room_request_sent_at');
    startRoomAckWatchdog();

    if (intent.mode === 'create') {
      send('create_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'ai') {
      send('create_ai_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'resume_room' || intent.mode === 'resume_local' || intent.mode === 'replay') {
      const payload = resolveResumePayload(intent);
      if (!payload || !payload.replay) {
        failPendingLaunch(
          '未找到可恢复的回放快照，请先在回放页选择一条记录。',
          '恢复数据缺失。'
        );
        return;
      }
      const resumeMode = intent.mode === 'replay' ? 'resume_local' : intent.mode;
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

    send('join_room', { name: intent.name, code: intent.code });
  }

  function beginShellLaunch(intent) {
    if (!intent || typeof intent !== 'object' || !intent.mode) return false;
    rememberLaunchIntent(intent);
    state.ui.launchIntentError = '';
    state.ui.lastLaunchIntentUrl = location.href;
    state.ui.connection.error = '';
    resetLobbyDraft();
    markAppTiming('launcher_click_at');
    showOptimisticRoom(intent);
    if (GPP.ws && GPP.ws.readyState === WebSocket.OPEN && state.ui.welcomeReceived) {
      triggerLaunchIntent(true);
      return true;
    }
    if (!GPP.ws || GPP.ws.readyState >= WebSocket.CLOSING) {
      connect('shell_launch');
    }
    return true;
  }

  function resetToLauncher() {
    clearRoomAckWatchdog();
    if (state.room && GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
      send('leave_room');
    }
    state.room = null;
    state.battleActions = null;
    state.pendingAction = null;
    state.ui.launchIntentConsumed = false;
    state.ui.launchIntentError = '';
    state.ui.resumePending = false;
    resetOptimisticState();
    clearLaunchFlowState();
    GPP.clearSelection();
    if (state.ui.welcomeReceived && GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
      setConnectionUi('ready', '连接可用。', '');
      setMessage('连接可用。');
      setLaunchHint('请选择新的战斗模式。');
    } else {
      setConnectionUi('connecting', '正在准备连接...', '');
      setMessage('正在准备连接...');
      setLaunchHint('正在准备连接...');
    }
    try {
      GPP.render();
    } catch {}
    return true;
  }

  function tryResumeSession() {
    const saved = getSavedResumeCredentials();
    if (!saved.roomCode || !saved.reconnectToken) return false;
    state.ui.resumePending = true;
    setLaunchHint(`检测到历史房间 ${saved.roomCode}，正在尝试恢复会话...`);
    setMessage(`检测到历史房间 ${saved.roomCode}，正在尝试恢复会话...`);
    setConnectionUi('resuming', '正在恢复会话...', '');
    send('resume_session', {
      roomCode: saved.roomCode,
      reconnectToken: saved.reconnectToken,
    });
    startRoomAckWatchdog();
    return true;
  }

  function scheduleReconnect(waitMs) {
    const jitteredWait = Math.max(800, Math.round(waitMs * (0.9 + (Math.random() * 0.25))));
    clearTimer(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect('retrying');
    }, jitteredWait);
  }

  function maybeFastReconnect(reason) {
    if (document.hidden) return false;
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return false;
    if (GPP.ws && (GPP.ws.readyState === WebSocket.OPEN || GPP.ws.readyState === WebSocket.CONNECTING)) {
      return false;
    }
    const saved = getSavedResumeCredentials();
    if (!state.room && !state.ui.launchIntent && !saved.roomCode) {
      return false;
    }
    clearTimer(reconnectTimer);
    connect(reason || 'fast_reconnect');
    return true;
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
    dispatchConnectionEvent(
      connectionMachine && connectionMachine.EVENTS
        ? ((mode === 'manual_reconnect' || mode === 'retrying')
          ? connectionMachine.EVENTS.USER_RECONNECT
          : connectionMachine.EVENTS.APP_START)
        : (mode === 'manual_reconnect' || mode === 'retrying' ? 'USER_RECONNECT' : 'APP_START'),
      { resetLaunchIntentConsumed: mode === 'manual_reconnect' }
    );
    markStartupTiming('socket_connect_requested_at');
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
      dispatchConnectionEvent(
        connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.SOCKET_OPEN : 'SOCKET_OPEN',
        { welcomeTimeoutMs: CONNECT_WELCOME_TIMEOUT_MS }
      );
      markAppTiming('socket_ready_at');
      state.ui.welcomeReceived = false;
      setConnectionUi('awaiting_welcome', '连接已建立，正在等待服务端欢迎消息。', '');
      setMessage('已连接服务器。');
      setLaunchHint('连接已建立，等待欢迎消息...');
      startWelcomeWatchdog();
    };

    ws.onerror = () => {
      if (token !== state.ui.socketToken) return;
      logger.warn('socket_error', { mode, token });
      dispatchConnectionEvent(
        connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.CONNECT_ERROR : 'CONNECT_ERROR',
        { error: 'socket_error' }
      );
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
      dispatchConnectionEvent(
        connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.SOCKET_CLOSE : 'SOCKET_CLOSE',
        { reason: 'socket_closed' }
      );
      const flow = getLaunchFlow();
      if (!state.room && !flow.roomAckReceived) {
        state.ui.launchIntentConsumed = false;
        resetLaunchRequest('socket_closed');
      }
      const currentDelay = Math.max(1000, Math.min(state.ui.reconnectDelay || 1000, GPP.MAX_RECONNECT_DELAY || 15000));
      const nextDelay = Math.max(1000, Math.min(Math.floor(currentDelay * 1.8), GPP.MAX_RECONNECT_DELAY || 15000));
      state.ui.reconnectDelay = nextDelay;
      const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
      const detail = offline
        ? '当前网络已离线，恢复后会自动重连。'
        : `连接已断开，${Math.max(1, Math.round(currentDelay / 1000))} 秒后自动重连...`;
      setMessage(detail);
      setConnectionUi('retry_wait', detail, offline ? '检测到网络离线。' : state.ui.connection.error);
      if (state.room) {
        setLaunchHint('网络波动中，正在尝试恢复房间...');
      } else if (state.ui.launchIntent) {
        setLaunchHint('网络波动中，恢复连接后会自动重试入房。');
      }
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

      if (routeLowRiskMessages(msg, { token, mode })) {
        return;
      }

      if (msg.type === 'welcome') {
        logger.info('welcome_received', {
          playerId: msg.playerId,
          protocolVersion: msg.meta && msg.meta.protocolVersion ? msg.meta.protocolVersion : null,
        });
        markStartupTiming('welcome_received_at');
        markAppTiming('welcome_received_at');
        clearWelcomeWatchdog();
        state.me = msg.playerId;
        state.battleActions = null;
        const freshReconnectToken = typeof msg.reconnectToken === 'string' ? msg.reconnectToken : '';
        state.ui.reconnectToken = freshReconnectToken || state.ui.reconnectToken || '';
        applyCatalogPayload(msg);
        ensureCatalogBackfill();
        if (dom.myIdEl) {
          dom.myIdEl.textContent = `玩家 ID：${msg.playerId}`;
        }

        state.ui.welcomeReceived = true;
        state.ui.reconnectDelay = 1000;
        if (freshReconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, freshReconnectToken);
        }

        maybeStartWsAuthentication();
        const shouldResumeOnWelcome = shouldAttemptResumeOnWelcome();
        const flow = getLaunchFlow();
        const shouldLaunchAfterWelcome = !!((state.ui.launchIntent || flow.originalIntent) && !flow.roomAckReceived);
        dispatchConnectionEvent(
          connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.WELCOME : 'WELCOME',
          {
            shouldResume: shouldResumeOnWelcome,
            shouldJoinIntent: shouldLaunchAfterWelcome,
            roomAckTimeoutMs: ROOM_ACK_TIMEOUT_MS,
          }
        );
        if (shouldResumeOnWelcome && tryResumeSession()) {
          return;
        }

        if (shouldLaunchAfterWelcome) {
          triggerLaunchIntent(false);
        } else {
          const notice = state.ui.launchIntentError || '连接成功。请从启动页选择模式进入房间。';
          setConnectionUi('ready', '连接成功，等待操作。', state.ui.launchIntentError || '');
          setMessage(notice);
          setLaunchHint(notice);
        }
        return;
      }

      if (msg.type === 'auth_state') {
        markStartupTiming('auth_state_received_at');
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
          if (state.room) {
            setConnectionUi('in_room', '已进入房间，账号同步失败，将继续以游客身份保持连接。', '');
          } else {
            setLaunchHint(`账号鉴权失败（${msg.reason || 'unknown'}），将以游客模式继续。`);
          }
        }

        if (state.ui.launchIntent && !state.ui.launchIntentConsumed && state.ui.welcomeReceived) {
          triggerLaunchIntent(false);
        }
        return;
      }

      if (msg.type === 'room_state') {
        markStartupTiming('room_state_received_at');
        markAppTiming('room_state_received_at');
        state.pendingAction = null;
        const prevRoomCode = state.room && state.room.code;
        const prevHadGame = !!(state.room && state.room.game);
        const nextRoomCode = msg.room && msg.room.code;

        state.room = msg.room;
        resetOptimisticState();
        markLaunchAckReceived();
        dispatchConnectionEvent(
          connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.ROOM_STATE : 'ROOM_STATE',
          { inRoom: !!msg.room }
        );
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
          const waitingReconnect = Array.isArray(state.room.players)
            ? state.room.players.some((player) => player && player.isOnline === false)
            : false;
          const launchHint = state.room.game
            ? `已进入房间 ${state.room.code}，对战进行中。`
            : (waitingReconnect
              ? `已进入房间 ${state.room.code}，对方正在重连，席位已保留。`
              : (state.room.roomMode === 'ai'
                ? `已进入 AI 房间 ${state.room.code}，请选择角色与曜彩骰后点击“开始对战”。`
                : `已进入房间 ${state.room.code}，请完成大厅配置。`));
          setLaunchHint(launchHint);
          setMessage(launchHint);
        }

        notifyShell('gpp:battle-shell-show');

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
        if (typeof GPP.preloadDeferredBattleFeatures === 'function') {
          GPP.preloadDeferredBattleFeatures();
        }
        markAppTiming('room_reconciled_at');
        maybeLogStartupTiming('room_state_received', {
          roomCode: state.room && state.room.code ? state.room.code : null,
          roomMode: state.room && state.room.roomMode ? state.room.roomMode : null,
        });
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
        markLaunchAckReceived();
        dispatchConnectionEvent(
          connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.RESUME_OK : 'RESUME_OK',
          {}
        );
        if (msg.playerId) {
          state.me = msg.playerId;
          if (dom.myIdEl) dom.myIdEl.textContent = `玩家 ID：${msg.playerId}`;
        }
        if (msg.roomCode) storageSet(LAST_ROOM_CODE_KEY, msg.roomCode);
        const savedToken = storageGet(RECONNECT_TOKEN_KEY);
        if (savedToken) state.ui.reconnectToken = savedToken;
        setConnectionUi('in_room', '会话恢复成功。', '');
        setMessage('已恢复到断线前房间，正在同步房间状态...');
        setLaunchHint('已恢复到断线前房间，正在同步房间状态...');
        notifyShell('gpp:battle-shell-show');
        return;
      }

      if (msg.type === 'session_resume_failed') {
        clearRoomAckWatchdog();
        state.ui.resumePending = false;
        storageSet(LAST_ROOM_CODE_KEY, '');
        if (state.ui.reconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, state.ui.reconnectToken);
        }
        const flow = getLaunchFlow();
        dispatchConnectionEvent(
          connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.RESUME_FAIL : 'RESUME_FAIL',
          {
            shouldJoinIntent: !!(state.ui.launchIntent && !flow.roomAckReceived),
            roomAckTimeoutMs: ROOM_ACK_TIMEOUT_MS,
          }
        );
        setConnectionUi('ready', '历史会话恢复失败。', '');
        setMessage(`会话恢复失败：${msg.reason || 'unknown'}`);
        if (state.ui.launchIntent && !flow.roomAckReceived) {
          resetLaunchRequest(msg.reason || 'session_resume_failed');
          triggerLaunchIntent(false);
        } else {
          resetLaunchRequest(msg.reason || 'session_resume_failed');
          setLaunchHint('之前的房间已经无法恢复。你可以重试自动入房，或返回启动页。');
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
        resetOptimisticState();
        storageSet(LAST_ROOM_CODE_KEY, '');
        clearRoomAckWatchdog();
        state.ui.launchIntentConsumed = false;
        getLaunchFlow().roomAckReceived = false;
        getLaunchFlow().roomRequestSent = false;
        dispatchConnectionEvent(
          connectionMachine && connectionMachine.EVENTS ? connectionMachine.EVENTS.LEFT_ROOM : 'LEFT_ROOM',
          {}
        );
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

        const joinFailure = (!state.room || state.ui.optimisticRoomActive || getLaunchFlow().roomRequestSent) && isJoinFailureCode(msg.code);
        if (joinFailure) {
          clearRoomAckWatchdog();
          state.ui.launchIntentConsumed = false;
          state.room = null;
          resetOptimisticState();
          resetLaunchRequest(msg.code || msg.message || 'join_failed');
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

    };
  }

  state.ui.connectionMachine = connectionMachine;
  state.ui.connection.status = 'idle';
  state.ui.suppressNextClose = false;
  state.ui.reconnectDelay = 1000;
  state.ui.wsAuthPending = false;
  state.ui.wsAuthAttempted = false;
  state.ui.wsAuthOk = false;
  state.ui.optimisticRoomActive = !!state.ui.optimisticRoomActive;
  ensureConnectionMachineState();
  getLaunchFlow();

  GPP.beginShellLaunch = beginShellLaunch;
  GPP.resetToLauncher = resetToLauncher;
  GPP.getConnectionDiagnostics = () => ({
    machineState: state.ui.connectionMachineState || null,
    machineLastEvent: state.ui.connectionMachineLastEvent || null,
    launchFlow: getLaunchFlow(),
    connection: state.ui.connection || null,
  });
  GPP.getEmbeddedShellStatus = () => ({
    ok: true,
    welcomeReceived: !!state.ui.welcomeReceived,
    inRoom: !!state.room,
    optimisticRoomActive: !!state.ui.optimisticRoomActive,
  });

  const parsed = state.ui.launchIntentBootstrapped
    ? {
      intent: state.ui.launchIntent || null,
      error: state.ui.launchIntentError || '',
    }
    : parseLaunchIntent();
  if (parsed.intent) {
    rememberLaunchIntent(parsed.intent);
  } else {
    state.ui.launchIntent = null;
    getLaunchFlow().originalIntent = null;
  }
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
      if (isEmbeddedShell()) {
        notifyShell('gpp:battle-shell-request-launcher');
        resetToLauncher();
        return;
      }
      location.href = urls.getBasePath(location);
    };
  }

  if (dom.backToLauncherInlineBtn) {
    dom.backToLauncherInlineBtn.onclick = () => {
      if (isEmbeddedShell()) {
        notifyShell('gpp:battle-shell-request-launcher');
        resetToLauncher();
        return;
      }
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
        resetLaunchRequest('');
        triggerLaunchIntent(true);
      } else {
        connect('retrying');
      }
    };
  }

  window.addEventListener('online', () => {
    const detail = '网络已恢复，正在尝试重连...';
    setMessage(detail);
    setLaunchHint(detail);
    maybeFastReconnect('online');
  });

  window.addEventListener('offline', () => {
    const detail = '当前网络已离线，恢复后会自动重连。';
    setMessage(detail);
    setLaunchHint(state.room ? '网络已离线，恢复后会自动尝试恢复房间。' : detail);
    setConnectionUi('retry_wait', detail, '检测到网络离线。');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      maybeFastReconnect('visibility_resume');
    }
  });

  window.addEventListener('pageshow', () => {
    maybeFastReconnect('pageshow');
  });

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
