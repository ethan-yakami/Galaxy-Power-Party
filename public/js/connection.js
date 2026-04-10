(function() {
  const { state, dom, send, setMessage } = GPP;
  const isBattlePage = /\/battle\.html$/i.test(location.pathname);

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
    open: { text: '已连通', className: 'statusOpen' },
    welcome_received: { text: '连接成功', className: 'statusWelcome' },
    retrying: { text: '重连中', className: 'statusRetrying' },
    failed: { text: '连接失败', className: 'statusFailed' },
  };

  function clearTimer(handle) {
    if (handle) {
      clearTimeout(handle);
    }
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
    if (dom.launchHint) {
      dom.launchHint.textContent = text;
    }
  }

  function buildWsUrl() {
    if (!location.host) {
      throw new Error('当前页面缺少 host，无法建立 WebSocket 连接。');
    }
    return `${GPP.wsProtocol}//${location.host}`;
  }

  function parseLaunchIntent() {
    if (!isBattlePage) {
      return { intent: null, error: '' };
    }

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
        return { intent: null, error: '加入房间参数无效：code 必须是4位数字。' };
      }
      return { intent: { mode, name, code }, error: '' };
    }

    return { intent: { mode, name }, error: '' };
  }

  function setConnectionState(status, detail, errorText) {
    state.ui.connection.status = status;
    state.ui.connection.detail = detail || '';
    state.ui.connection.error = errorText || '';
    renderConnectionStateUI();
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
      const showReconnect = status === 'failed' || status === 'retrying';
      dom.reconnectBtn.classList.toggle('hidden', !showReconnect);
      dom.reconnectBtn.disabled = status === 'connecting';
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

  function stopConnectWatchdog() {
    clearTimer(connectWatchdogTimer);
    connectWatchdogTimer = null;
  }

  function stopRoomAckWatchdog() {
    clearTimer(roomAckTimer);
    roomAckTimer = null;
    state.ui.roomAckPending = false;
  }

  function scheduleReconnect(reasonText) {
    clearTimer(reconnectTimer);

    const waitMs = GPP.reconnectDelay;
    const waitSeconds = Math.max(1, Math.round(waitMs / 1000));

    setConnectionState('retrying', `${reasonText}${waitSeconds}秒后重连...`, state.ui.connection.error);
    setMessage(`连接断开，${waitSeconds}秒后自动重连...`);

    reconnectTimer = setTimeout(() => {
      connect('retrying');
    }, waitMs);

    GPP.reconnectDelay = Math.min(GPP.reconnectDelay * 2, GPP.MAX_RECONNECT_DELAY);
  }

  function triggerLaunchIntent(force) {
    if (!isBattlePage) return;

    const intent = state.ui.launchIntent;
    if (!intent) return;

    if (state.ui.launchIntentConsumed && !force) return;

    if (!GPP.ws || GPP.ws.readyState !== WebSocket.OPEN || !state.ui.welcomeReceived) {
      setConnectionState('failed', '连接未就绪，暂时无法自动入房。', '请先点击“重新连接”后再重试。');
      return;
    }

    state.ui.launchIntentConsumed = true;
    state.ui.roomAckPending = true;

    stopRoomAckWatchdog();
    roomAckTimer = setTimeout(() => {
      if (!state.ui.roomAckPending || state.room) return;

      state.ui.roomAckPending = false;
      state.ui.launchIntentConsumed = false;

      const timeoutText = '已连接但房间回执超时，请重试自动入房。';
      setLaunchHint(timeoutText);
      setMessage(timeoutText);
      setConnectionState('failed', '房间回执超时。', timeoutText);
    }, ROOM_ACK_TIMEOUT_MS);

    if (intent.mode === 'create') {
      setLaunchHint('已连接，正在创建房间...');
      send('create_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'ai') {
      setLaunchHint('已连接，正在创建 AI 对战房间...');
      send('create_ai_room', { name: intent.name });
      return;
    }

    if (intent.mode === 'join') {
      setLaunchHint(`已连接，正在加入房间 ${intent.code}...`);
      send('join_room', { name: intent.name, code: intent.code });
    }
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
    setConnectionState('welcome_received', '检测到断线会话，正在自动恢复。');
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
      setConnectionState('failed', '连接地址无效或被浏览器策略拦截。', reason);
      return null;
    }
  }

  function attachSocketHandlers(ws, token) {
    ws.onopen = () => {
      if (token !== state.ui.socketToken) return;

      GPP.reconnectDelay = 1000;
      state.ui.welcomeReceived = false;

      setConnectionState('open', '连接已建立，正在等待服务器欢迎消息。');
      setMessage('已连接服务器。');
      setLaunchHint('连接已建立，等待欢迎消息...');

      stopConnectWatchdog();
      connectWatchdogTimer = setTimeout(() => {
        if (token !== state.ui.socketToken) return;
        if (state.ui.welcomeReceived) return;

        const timeoutReason = '连接超时，未收到服务器欢迎消息。';
        setMessage(timeoutReason);
        setLaunchHint(timeoutReason);
        setConnectionState('failed', '连接超时。', timeoutReason);

        try {
          ws.close();
        } catch {}
      }, CONNECT_WELCOME_TIMEOUT_MS);
    };

    ws.onerror = () => {
      if (token !== state.ui.socketToken) return;
      setConnectionState('retrying', '连接出现异常，等待自动重连...', '网络异常或浏览器阻止了连接。');
    };

    ws.onclose = () => {
      if (token !== state.ui.socketToken) return;

      state.ui.welcomeReceived = false;
      stopConnectWatchdog();
      stopRoomAckWatchdog();

      scheduleReconnect('连接已断开，');
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
        const freshReconnectToken = typeof msg.reconnectToken === 'string' ? msg.reconnectToken : '';
        state.ui.reconnectToken = freshReconnectToken || state.ui.reconnectToken || '';
        (msg.characters || []).forEach((c) => {
          state.characters[c.id] = c;
        });
        state.auroraDice = msg.auroraDice || [];

        if (dom.myIdEl) {
          dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
        }

        state.ui.welcomeReceived = true;
        stopConnectWatchdog();

        if (tryResumeSession()) {
          return;
        }

        if (freshReconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, freshReconnectToken);
        }

        if (state.ui.launchIntent) {
          setConnectionState('welcome_received', '连接成功，正在自动进入房间。');
          setMessage('连接成功，正在自动进入房间...');
          triggerLaunchIntent(false);
        } else {
          const notice = state.ui.launchIntentError || '连接成功。请从启动台打开战斗页。';
          setConnectionState('welcome_received', '连接成功，等待手动操作。', state.ui.launchIntentError || '');
          setMessage(notice);
          setLaunchHint(notice);
        }
        return;
      }

      if (msg.type === 'room_state') {
        state.pendingAction = null;
        state.ui.resumePending = false;
        const prevRoomCode = state.room && state.room.code;
        const prevHadGame = !!(state.room && state.room.game);
        const nextRoomCode = msg.room && msg.room.code;

        state.room = msg.room;
        if (state.room && state.room.code) {
          storageSet(LAST_ROOM_CODE_KEY, state.room.code);
          state.ui.launchIntentConsumed = true;
        }
        if (prevRoomCode !== nextRoomCode) {
          state.ui.pendingCharacterId = null;
          state.ui.pendingAuroraDiceId = null;
          state.ui.pendingDirty = false;
          state.ui.confirmHint = '';
        }

        const mePlayer = state.room && state.room.players
          ? state.room.players.find((p) => p.id === state.me)
          : null;
        if (mePlayer && !state.ui.pendingDirty) {
          state.ui.pendingCharacterId = mePlayer.characterId || state.ui.pendingCharacterId;
          state.ui.pendingAuroraDiceId = mePlayer.auroraDiceId || null;
        }

        stopRoomAckWatchdog();

        if (!state.room.game) {
          GPP.clearSelection();
          state.lastProcessedEffectId = 0;
        } else if (state.room.game.phase === 'attack_reroll_or_select' && state.room.game.attackerId === state.me) {
          GPP.setSelection(state.room.game.attackPreviewSelection || []);
        } else if (state.room.game.phase === 'defense_select' && state.room.game.defenderId === state.me) {
          GPP.setSelection(state.room.game.defensePreviewSelection || []);
        } else {
          GPP.clearSelection();
        }

        setConnectionState('welcome_received', '已进入房间，连接稳定。');
        if (isBattlePage && dom.launchHint) {
          setLaunchHint(`已进入房间 ${state.room.code}，开始对战。`);
        }

        GPP.render();
        GPP.processEffectEvents(state.room.game || {}, prevRoomCode === state.room.code && prevHadGame);
        return;
      }

      if (msg.type === 'session_resumed') {
        if (msg.playerId) {
          state.me = msg.playerId;
          if (dom.myIdEl) {
            dom.myIdEl.textContent = `玩家ID：${msg.playerId}`;
          }
        }
        state.ui.resumePending = false;
        state.ui.launchIntentConsumed = true;
        stopRoomAckWatchdog();
        setConnectionState('welcome_received', '会话恢复成功。');
        setMessage('已恢复到断线前房间。');
        if (msg.roomCode) {
          storageSet(LAST_ROOM_CODE_KEY, msg.roomCode);
        }
        const savedToken = storageGet(RECONNECT_TOKEN_KEY);
        if (savedToken) {
          state.ui.reconnectToken = savedToken;
        }
        return;
      }

      if (msg.type === 'session_resume_failed') {
        state.ui.resumePending = false;
        storageSet(LAST_ROOM_CODE_KEY, '');
        if (state.ui.reconnectToken) {
          storageSet(RECONNECT_TOKEN_KEY, state.ui.reconnectToken);
        }
        const reason = msg.reason || 'unknown';
        setMessage(`会话恢复失败：${reason}`);
        setConnectionState('welcome_received', '历史会话恢复失败，将尝试常规入房。');
        if (state.ui.launchIntent) {
          triggerLaunchIntent(false);
        }
        return;
      }

      if (msg.type === 'player_presence_changed') {
        if (state.room && state.room.code === msg.roomCode && Array.isArray(state.room.players)) {
          const target = state.room.players.find((p) => p.id === msg.playerId);
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
        state.ui.resumePending = false;
        GPP.clearSelection();
        state.lastProcessedEffectId = 0;
        state.ui.pendingCharacterId = null;
        state.ui.pendingAuroraDiceId = null;
        state.ui.pendingDirty = false;
        state.ui.confirmHint = '';
        state.ui.launchIntentConsumed = false;
        storageSet(LAST_ROOM_CODE_KEY, '');
        stopRoomAckWatchdog();
        GPP.render();

        const reason = msg.reason || '你已退出房间。';
        setMessage(reason);
        setLaunchHint(reason);
        GPP.showErrorToast(reason);
        return;
      }

      if (msg.type === 'error') {
        state.pendingAction = null;
        const errorText = `错误：${msg.message}`;
        setMessage(errorText);
        if (state.ui.welcomeReceived && GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
          setConnectionState('welcome_received', '连接稳定。', '');
        } else {
          setConnectionState('failed', '服务器返回错误。', msg.message || errorText);
        }
        GPP.showErrorToast(msg.message || '发生错误');
        GPP.render();
        return;
      }

      if (msg.type === 'custom_character_created') {
        const createdName = msg.name || msg.characterId || '自定义角色';
        const toast = `已创建角色：${createdName}`;
        setMessage(toast);
        return;
      }

      if (msg.type === 'characters_updated') {
        state.characters = {};
        (msg.characters || []).forEach((c) => {
          state.characters[c.id] = c;
        });
        GPP.render();
      }
    };
  }

  function connect(mode) {
    clearTimer(reconnectTimer);

    stopConnectWatchdog();
    state.ui.resumePending = false;

    let wsUrl;
    try {
      wsUrl = buildWsUrl();
    } catch (error) {
      const reason = error && error.message ? error.message : String(error);
      setMessage(reason);
      setLaunchHint(reason);
      setConnectionState('failed', '无法构建连接地址。', reason);
      return;
    }

    state.ui.socketToken += 1;
    const token = state.ui.socketToken;

    state.ui.welcomeReceived = false;
    setConnectionState(mode === 'retrying' ? 'retrying' : 'connecting', mode === 'retrying' ? '正在重新建立连接...' : '正在建立连接...');

    const ws = openSocket(wsUrl);
    if (!ws) return;

    GPP.ws = ws;
    attachSocketHandlers(ws, token);
  }

  const parsed = parseLaunchIntent();
  state.ui.launchIntent = parsed.intent;
  state.ui.launchIntentError = parsed.error;

  if (dom.createBtn) {
    dom.createBtn.onclick = () => {
      send('create_room', { name: GPP.getMyName() });
    };
  }

  if (dom.aiBtn) {
    dom.aiBtn.onclick = () => {
      send('create_ai_room', { name: GPP.getMyName() });
    };
  }

  if (dom.joinBtn) {
    dom.joinBtn.onclick = () => {
      send('join_room', { name: GPP.getMyName(), code: dom.roomCodeInput ? dom.roomCodeInput.value.trim() : '' });
    };
  }

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
      state.ui.launchIntentConsumed = false;
      stopRoomAckWatchdog();

      if (GPP.ws) {
        try { GPP.ws.close(); } catch {}
      }

      connect('connecting');
    };
  }

  if (dom.retryIntentBtn) {
    dom.retryIntentBtn.onclick = () => {
      triggerLaunchIntent(true);
    };
  }

  if (isBattlePage) {
    if (state.ui.launchIntent) {
      setLaunchHint('正在建立连接并自动执行建房/入房...');
    } else {
      const reason = state.ui.launchIntentError || '未检测到有效启动参数，请从启动台进入。';
      setLaunchHint(reason);
      setConnectionState('failed', '无法自动进入房间。', reason);
      setMessage(reason);
    }
  }

  renderConnectionStateUI();
  connect('connecting');
  GPP.render();
})();
