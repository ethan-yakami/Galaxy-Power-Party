(function() {
  const machine = window.GPPConnectionStateMachine;
  const { state, dom, send, setMessage } = GPP;
  const isBattlePage = /\/battle\.html$/i.test(location.pathname);
  const replayHistory = window.GPPReplayHistory || null;

  const CONNECT_WELCOME_TIMEOUT_MS = 6000;
  const ROOM_ACK_TIMEOUT_MS = 8000;
  const RECONNECT_TOKEN_KEY = 'gpp_reconnect_token';
  const LAST_ROOM_CODE_KEY = 'gpp_last_room_code';

  let connectWatchdogTimer = null;
  let roomAckTimer = null;
  let reconnectTimer = null;

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
    if (dom.launchHint) dom.launchHint.textContent = text;
  }

  function buildWsUrl() {
    if (!location.host) {
      throw new Error('当前页面缺少 host，无法建立 WebSocket 连接。');
    }
    return `${GPP.wsProtocol}//${location.host}`;
  }

  function parseLaunchIntent() {
    if (!isBattlePage) return { intent: null, error: '' };

    const params = new URLSearchParams(location.search);
    const mode = String(params.get('mode') || '').trim();
    if (!mode) {
      return { intent: null, error: '未检测到启动参数，请从启动台打开战斗页。' };
    }
    if (!['create', 'join', 'ai'].includes(mode)) {
      return { intent: null, error: `启动参数 mode 无效：${mode}` };
    }

    const rawName = String(params.get('name') || '').trim();
    const name = (rawName || `玩家${Math.floor(Math.random() * 1000)}`).slice(0, 20);
    if (mode === 'join') {
      const code = String(params.get('code') || '').trim();
      if (!/^\d{4}$/.test(code)) {
        return { intent: null, error: '加入房间参数无效：code 必须是 4 位数字。' };
      }
      return { intent: { mode, name, code }, error: '' };
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

  function syncMachineFlags() {
    const connectionMachine = state.ui.connectionMachine;
    if (!connectionMachine) return;
    state.ui.connection.status = connectionMachine.status;
    state.ui.launchIntentConsumed = !!connectionMachine.launchIntentConsumed;
    state.ui.resumePending = !!connectionMachine.resumePending;
    state.ui.roomAckPending = !!connectionMachine.roomAckPending;
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

  function setConnectionUi(detail, errorText) {
    if (detail !== undefined) state.ui.connection.detail = detail || '';
    if (errorText !== undefined) state.ui.connection.error = errorText || '';
    syncMachineFlags();
    renderConnectionStateUI();
  }

  function onWatchdogTimeout(kind) {
    if (!machine) return;
    applyMachineEvent(machine.EVENTS.WATCHDOG_TIMEOUT, { kind });
    if (kind === 'welcome') {
      const timeoutReason = '连接超时，未收到服务器欢迎消息。';
      setMessage(timeoutReason);
      setLaunchHint(timeoutReason);
      setConnectionUi('连接超时。', timeoutReason);
      try {
        if (GPP.ws) GPP.ws.close();
      } catch {}
      return;
    }

    const timeoutText = '已连接但房间回执超时，请重试自动入房。';
    setLaunchHint(timeoutText);
    setMessage(timeoutText);
    setConnectionUi('房间回执超时。', timeoutText);
  }

  function applyEffects(effects) {
    (effects || []).forEach((effect) => {
      switch (effect.type) {
        case machine.EFFECTS.START_WELCOME_WATCHDOG:
          clearTimer(connectWatchdogTimer);
          connectWatchdogTimer = setTimeout(() => onWatchdogTimeout('welcome'), effect.timeoutMs);
          break;
        case machine.EFFECTS.STOP_WELCOME_WATCHDOG:
          clearTimer(connectWatchdogTimer);
          connectWatchdogTimer = null;
          break;
        case machine.EFFECTS.START_ROOM_ACK_WATCHDOG:
          clearTimer(roomAckTimer);
          roomAckTimer = setTimeout(() => onWatchdogTimeout('room_ack'), effect.timeoutMs);
          break;
        case machine.EFFECTS.STOP_ROOM_ACK_WATCHDOG:
          clearTimer(roomAckTimer);
          roomAckTimer = null;
          break;
        case machine.EFFECTS.SCHEDULE_RECONNECT:
          clearTimer(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connect(machine.EVENTS.APP_START, 'retrying');
          }, effect.waitMs);
          break;
        case machine.EFFECTS.CANCEL_RECONNECT:
          clearTimer(reconnectTimer);
          reconnectTimer = null;
          break;
        default:
          break;
      }
    });
  }

  function applyMachineEvent(event, payload) {
    if (!machine) return { state: null, effects: [] };
    const result = machine.transition(state.ui.connectionMachine, event, payload || {});
    state.ui.connectionMachine = result.state;
    applyEffects(result.effects);
    syncMachineFlags();
    renderConnectionStateUI();
    return result;
  }

  function triggerLaunchIntent(force) {
    if (!isBattlePage) return;
    const intent = state.ui.launchIntent;
    if (!intent) return;
    if (state.ui.launchIntentConsumed && !force) return;

    if (!GPP.ws || GPP.ws.readyState !== WebSocket.OPEN || !state.ui.welcomeReceived) {
      setConnectionUi('连接尚未就绪，暂时无法自动入房。', '请先点击“重新连接”后再重试。');
      return;
    }

    applyMachineEvent(machine.EVENTS.INTENT_RETRY, { roomAckTimeoutMs: ROOM_ACK_TIMEOUT_MS });

    if (intent.mode === 'create') {
      setLaunchHint('已连接，正在创建房间...');
      setMessage('已连接，正在创建房间...');
      setConnectionUi('正在创建房间...', '');
      send('create_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'ai') {
      setLaunchHint('已连接，正在创建 AI 对战房间...');
      setMessage('已连接，正在创建 AI 对战房间...');
      setConnectionUi('正在创建 AI 对战房间...', '');
      send('create_ai_room', { name: intent.name });
      return;
    }

    setLaunchHint(`已连接，正在加入房间 ${intent.code}...`);
    setMessage(`已连接，正在加入房间 ${intent.code}...`);
    setConnectionUi(`正在加入房间 ${intent.code}...`, '');
    send('join_room', { name: intent.name, code: intent.code });
  }

  function tryResumeSession() {
    const roomCode = storageGet(LAST_ROOM_CODE_KEY);
    const storedToken = storageGet(RECONNECT_TOKEN_KEY);
    const reconnectToken = (roomCode && storedToken)
      ? storedToken
      : (state.ui.reconnectToken || storedToken);
    if (!roomCode || !reconnectToken) return false;
    setLaunchHint(`检测到历史房间 ${roomCode}，正在尝试恢复会话...`);
    setMessage(`检测到历史房间 ${roomCode}，正在尝试恢复会话...`);
    send('resume_session', { roomCode, reconnectToken });
    return true;
  }

  function openSocket(url) {
    try {
      return new WebSocket(url);
    } catch (error) {
      const reason = `WebSocket 构造失败：${error && error.message ? error.message : String(error)}`;
      setMessage(reason);
      setLaunchHint(reason);
      applyMachineEvent(machine.EVENTS.CONNECT_ERROR, { error: reason });
      setConnectionUi('连接地址无效或被浏览器阻止。', reason);
      return null;
    }
  }

  function attachSocketHandlers(ws, token) {
    ws.onopen = () => {
      if (token !== state.ui.socketToken) return;
      state.ui.welcomeReceived = false;
      applyMachineEvent(machine.EVENTS.SOCKET_OPEN, { welcomeTimeoutMs: CONNECT_WELCOME_TIMEOUT_MS });
      setConnectionUi('连接已建立，正在等待服务器欢迎消息。', '');
      setMessage('已连接服务器。');
      setLaunchHint('连接已建立，等待欢迎消息...');
    };

    ws.onerror = () => {
      if (token !== state.ui.socketToken) return;
      setConnectionUi(state.ui.connection.detail, '网络异常或浏览器阻止了连接。');
    };

    ws.onclose = () => {
      if (token !== state.ui.socketToken) return;
      state.ui.welcomeReceived = false;
      if (state.ui.suppressNextClose) {
        state.ui.suppressNextClose = false;
        return;
      }
      const result = applyMachineEvent(machine.EVENTS.SOCKET_CLOSE, { reason: 'closed' });
      const reconnectEffect = (result.effects || []).find((effect) => effect.type === machine.EFFECTS.SCHEDULE_RECONNECT);
      const waitSeconds = reconnectEffect ? Math.max(1, Math.round(reconnectEffect.waitMs / 1000)) : 1;
      setMessage(`连接已断开，${waitSeconds} 秒后自动重连...`);
      setConnectionUi(`连接已断开，${waitSeconds} 秒后自动重连...`, state.ui.connection.error);
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
        state.me = msg.playerId;
        state.battleActions = null;
        const freshReconnectToken = typeof msg.reconnectToken === 'string' ? msg.reconnectToken : '';
        state.ui.reconnectToken = freshReconnectToken || state.ui.reconnectToken || '';
        state.characters = {};
        (msg.characters || []).forEach((character) => {
          state.characters[character.id] = character;
        });
        state.auroraDice = msg.auroraDice || [];
        if (dom.myIdEl) {
          dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
        }

        state.ui.welcomeReceived = true;
        const shouldResume = !!(storageGet(LAST_ROOM_CODE_KEY) && (storageGet(RECONNECT_TOKEN_KEY) || state.ui.reconnectToken));
        const shouldJoinIntent = !!state.ui.launchIntent;
        applyMachineEvent(machine.EVENTS.WELCOME, {
          shouldResume,
          shouldJoinIntent,
          roomAckTimeoutMs: ROOM_ACK_TIMEOUT_MS,
        });

        if (tryResumeSession()) {
          setConnectionUi('检测到断线会话，正在自动恢复。', '');
          return;
        }

        if (freshReconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, freshReconnectToken);
        }

        if (state.ui.launchIntent) {
          setConnectionUi('连接成功，准备自动进入房间。', '');
          setMessage('连接成功，准备自动进入房间...');
          triggerLaunchIntent(false);
        } else {
          const notice = state.ui.launchIntentError || '连接成功。请从启动台打开战斗页。';
          setConnectionUi('连接成功，等待手动操作。', state.ui.launchIntentError || '');
          setMessage(notice);
          setLaunchHint(notice);
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

        applyMachineEvent(machine.EVENTS.ROOM_STATE, { inRoom: !!state.room });
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

        setConnectionUi('已进入房间，连接稳定。', '');
        if (isBattlePage && dom.launchHint && state.room) {
          setLaunchHint(state.room.game
            ? `已进入房间 ${state.room.code}，对战进行中。`
            : `已进入房间 ${state.room.code}，请完成大厅配置。`);
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

        GPP.processEffectEvents(state.room.game || {}, prevRoomCode === state.room.code && prevHadGame);
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
        if (msg.playerId) {
          state.me = msg.playerId;
          if (dom.myIdEl) dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
        }
        applyMachineEvent(machine.EVENTS.RESUME_OK, {});
        setConnectionUi('会话恢复成功。', '');
        setMessage('已恢复到断线前房间。');
        if (msg.roomCode) storageSet(LAST_ROOM_CODE_KEY, msg.roomCode);
        const savedToken = storageGet(RECONNECT_TOKEN_KEY);
        if (savedToken) state.ui.reconnectToken = savedToken;
        return;
      }

      if (msg.type === 'session_resume_failed') {
        storageSet(LAST_ROOM_CODE_KEY, '');
        if (state.ui.reconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, state.ui.reconnectToken);
        }
        applyMachineEvent(machine.EVENTS.RESUME_FAIL, { shouldJoinIntent: !!state.ui.launchIntent });
        setConnectionUi('历史会话恢复失败，将尝试常规入房。', '');
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
        const display = GPP.getWeatherDisplay({
          round: Number.isInteger(msg.round) ? msg.round : (state.room && state.room.game ? state.room.game.round : 1),
          weather: weatherPayload,
        });
        GPP.showWeatherBroadcast(display);
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
        applyMachineEvent(machine.EVENTS.LEFT_ROOM, {});
        GPP.render();

        const reason = msg.reason || '你已退出房间。';
        setMessage(reason);
        setLaunchHint(reason);
        setConnectionUi('已离开房间。', '');
        GPP.showErrorToast(reason);
        return;
      }

      if (msg.type === 'error') {
        state.pendingAction = null;
        state.ui.loadoutSubmitting = false;
        state.ui.submittedLoadout = null;
        const errorText = `错误：${msg.message}`;
        setMessage(errorText);
        if (state.ui.welcomeReceived && GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
          setConnectionUi('连接稳定。', '');
        } else {
          applyMachineEvent(machine.EVENTS.CONNECT_ERROR, { error: msg.message || errorText });
          setConnectionUi('服务器返回错误。', msg.message || errorText);
        }
        GPP.showErrorToast(msg.message || '发生错误');
        GPP.render();
        return;
      }

      if (msg.type === 'custom_character_created') {
        const createdName = msg.name || msg.characterId || '自定义角色';
        setMessage(`已创建角色：${createdName}`);
        return;
      }

      if (msg.type === 'characters_updated') {
        state.characters = {};
        (msg.characters || []).forEach((character) => {
          state.characters[character.id] = character;
        });
        GPP.render();
      }
    };
  }

  function connect(eventType, mode) {
    clearTimer(reconnectTimer);
    reconnectTimer = null;

    let wsUrl;
    try {
      wsUrl = buildWsUrl();
    } catch (error) {
      const reason = error && error.message ? error.message : String(error);
      setMessage(reason);
      setLaunchHint(reason);
      applyMachineEvent(machine.EVENTS.CONNECT_ERROR, { error: reason });
      setConnectionUi('无法构建连接地址。', reason);
      return;
    }

    applyMachineEvent(eventType, { resetLaunchIntentConsumed: eventType === machine.EVENTS.USER_RECONNECT });
    setConnectionUi(
      mode === 'retrying' ? '正在重新建立连接...' : '正在建立连接...',
      ''
    );

    state.ui.socketToken += 1;
    const token = state.ui.socketToken;
    state.ui.welcomeReceived = false;

    const ws = openSocket(wsUrl);
    if (!ws) return;
    GPP.ws = ws;
    attachSocketHandlers(ws, token);
  }

  state.ui.connectionMachine = machine
    ? machine.createInitialState({ reconnectDelayMs: 1000, maxReconnectDelayMs: 15000 })
    : null;
  state.ui.connection.status = state.ui.connectionMachine ? state.ui.connectionMachine.status : 'failed';
  state.ui.suppressNextClose = false;

  const parsed = parseLaunchIntent();
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
      location.href = '/';
    };
  }

  if (dom.backToLauncherInlineBtn) {
    dom.backToLauncherInlineBtn.onclick = () => {
      location.href = '/';
    };
  }

  if (dom.reconnectBtn) {
    dom.reconnectBtn.onclick = () => {
      state.ui.suppressNextClose = true;
      try {
        if (GPP.ws) GPP.ws.close();
      } catch {}
      connect(machine.EVENTS.USER_RECONNECT, 'connecting');
    };
  }

  if (dom.retryIntentBtn) {
    dom.retryIntentBtn.onclick = () => {
      triggerLaunchIntent(true);
    };
  }

  if (isBattlePage) {
    if (state.ui.launchIntent) {
      setLaunchHint('正在建立连接并自动进入战斗房间...');
    } else {
      const reason = state.ui.launchIntentError || '未检测到有效启动参数，请从启动台进入。';
      setLaunchHint(reason);
      applyMachineEvent(machine.EVENTS.CONNECT_ERROR, { error: reason });
      setConnectionUi('无法自动进入房间。', reason);
      setMessage(reason);
    }
  }

  renderConnectionStateUI();
  connect(machine.EVENTS.APP_START, 'connecting');
  GPP.render();
})();
