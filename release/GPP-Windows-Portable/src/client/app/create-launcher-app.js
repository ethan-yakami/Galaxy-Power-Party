const JOINABLE_REASON_TEXT = Object.freeze({
  ok: '可加入',
  room_full: '房间已满',
  in_game: '对局进行中',
  ended: '对局已结束',
  private: '私有房间',
  reserved_slot: '席位保留中（对方重连中）',
});

export function createLauncherApp(options) {
  const {
    authApi,
    documentRef,
    shellApi,
    urls,
    windowRef,
  } = options;

  const nameInput = documentRef.getElementById('nameInput');
  const roomCodeInput = documentRef.getElementById('roomCodeInput');
  const createBtn = documentRef.getElementById('createBtn');
  const joinBtn = documentRef.getElementById('joinBtn');
  const aiBtn = documentRef.getElementById('aiBtn');
  const replaysBtn = documentRef.getElementById('replaysBtn');
  const workshopBtn = documentRef.getElementById('workshopBtn');
  const messageEl = documentRef.getElementById('launcherMessage');
  const publicRoomSelect = documentRef.getElementById('publicRoomSelect');
  const refreshPublicRoomsBtn = documentRef.getElementById('refreshPublicRoomsBtn');
  const publicRoomsHint = documentRef.getElementById('publicRoomsHint');
  const authStatusText = documentRef.getElementById('authStatusText');
  const authUsernameInput = documentRef.getElementById('authUsernameInput');
  const authPasswordInput = documentRef.getElementById('authPasswordInput');
  const authRegisterBtn = documentRef.getElementById('authRegisterBtn');
  const authLoginBtn = documentRef.getElementById('authLoginBtn');
  const authLogoutBtn = documentRef.getElementById('authLogoutBtn');

  let publicRoomMap = new Map();
  let refreshTimer = 0;

  function setMessage(text, isError) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.classList.toggle('error', !!isError);
  }

  function getPlayerName() {
    const raw = nameInput ? String(nameInput.value || '').trim() : '';
    if (raw) return raw.slice(0, 20);
    return `玩家${Math.floor(Math.random() * 1000)}`;
  }

  function navigate(targetPath, successText) {
    if (successText) setMessage(successText, false);
    windowRef.location.href = urls.toPath(targetPath, windowRef.location);
  }

  function openBattlePage(mode, name, code) {
    if (shellApi && typeof shellApi.openBattleIntent === 'function') {
      setMessage('正在打开战斗房间...', false);
      shellApi.openBattleIntent({ mode, name, code: code || '' });
      return;
    }

    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('name', name);
    if (code) params.set('code', code);
    navigate(`battle.html?${params.toString()}`, '正在进入战斗房间...');
  }

  function openStandalonePage(targetPath, successText) {
    navigate(targetPath, successText);
  }

  function normalizeJoinableReason(room) {
    if (!room || typeof room !== 'object') return 'room_full';
    if (typeof room.joinableReason === 'string' && room.joinableReason) {
      return room.joinableReason;
    }
    return room.joinable ? 'ok' : 'room_full';
  }

  function getJoinableReasonText(reason) {
    return JOINABLE_REASON_TEXT[reason] || reason || '不可加入';
  }

  function indexPublicRooms(rooms) {
    publicRoomMap = new Map();
    for (const room of Array.isArray(rooms) ? rooms : []) {
      if (!room || !room.code) continue;
      publicRoomMap.set(String(room.code), room);
    }
  }

  function findPublicRoom(code) {
    if (!code) return null;
    return publicRoomMap.get(String(code).trim()) || null;
  }

  function renderPublicRooms(rooms) {
    if (!publicRoomSelect) return;

    const list = Array.isArray(rooms) ? rooms : [];
    const previousCode = String(publicRoomSelect.value || '').trim();
    indexPublicRooms(list);
    publicRoomSelect.innerHTML = '';

    const placeholder = documentRef.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '选择公开房间...' : '暂无公开房间';
    publicRoomSelect.appendChild(placeholder);

    let joinableCount = 0;
    for (const room of list) {
      const option = documentRef.createElement('option');
      const reason = normalizeJoinableReason(room);
      const status = room.status === 'lobby' ? '大厅' : (room.status || '未知');
      if (reason === 'ok') joinableCount += 1;
      option.value = room.code;
      option.disabled = reason !== 'ok';
      option.textContent = `${room.code} | ${status} | ${room.playerCount || 0}/${room.capacity || 2} | ${getJoinableReasonText(reason)}`;
      publicRoomSelect.appendChild(option);
    }

    if (previousCode) {
      const previousRoom = findPublicRoom(previousCode);
      publicRoomSelect.value = previousRoom && normalizeJoinableReason(previousRoom) === 'ok' ? previousCode : '';
    }

    if (publicRoomsHint) {
      const blockedCount = Math.max(0, list.length - joinableCount);
      publicRoomsHint.textContent = list.length
        ? `公开房间 ${list.length} 个，可加入 ${joinableCount} 个，不可加入 ${blockedCount} 个。`
        : '暂无公开房间，稍后刷新重试。';
    }
  }

  async function refreshPublicRooms(showMessage) {
    if (refreshPublicRoomsBtn) refreshPublicRoomsBtn.disabled = true;
    try {
      const response = await windowRef.fetch(urls.toApi(`public-rooms?t=${Date.now()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const list = Array.isArray(payload && payload.rooms) ? payload.rooms : [];
      const joinableCount = list.filter((item) => normalizeJoinableReason(item) === 'ok').length;
      renderPublicRooms(list);

      if (showMessage) {
        setMessage(
          list.length
            ? `公开房间列表已刷新，可加入 ${joinableCount} 个。`
            : '当前没有公开房间。',
          false,
        );
      }
    } catch (error) {
      renderPublicRooms([]);
      if (showMessage) {
        setMessage(`刷新公开房间失败：${error && error.message ? error.message : String(error)}`, true);
      }
    } finally {
      if (refreshPublicRoomsBtn) refreshPublicRoomsBtn.disabled = false;
    }
  }

  function getAuthForm() {
    return {
      username: authUsernameInput ? String(authUsernameInput.value || '').trim() : '',
      password: authPasswordInput ? String(authPasswordInput.value || '') : '',
    };
  }

  function renderAuthStatus() {
    if (!authApi || !authStatusText) return;
    const session = authApi.getSession();
    if (session && session.user && session.user.username) {
      authStatusText.textContent = `已登录：${session.user.username}`;
    } else if (session && session.isAuthenticated) {
      authStatusText.textContent = '已登录';
    } else {
      authStatusText.textContent = '未登录';
    }
  }

  async function runAuthAction(kind) {
    if (!authApi) return;

    const { username, password } = getAuthForm();
    if (kind !== 'logout') {
      if (username.length < 3) {
        setMessage('用户名至少需要 3 位。', true);
        return;
      }
      if (password.length < 6) {
        setMessage('密码至少需要 6 位。', true);
        return;
      }
    }

    try {
      if (kind === 'register') {
        const result = await authApi.register(username, password);
        if (!result.ok) {
          setMessage(`注册失败：${result.code || result.status || 'unknown'}`, true);
          return;
        }
        setMessage('注册成功，已自动登录。', false);
      } else if (kind === 'login') {
        const result = await authApi.login(username, password);
        if (!result.ok) {
          setMessage(`登录失败：${result.code || result.status || 'unknown'}`, true);
          return;
        }
        setMessage('登录成功。', false);
      } else {
        await authApi.logout();
        setMessage('已退出登录。', false);
      }

      renderAuthStatus();
      refreshPublicRooms(false);
    } catch (error) {
      setMessage(`账号操作失败：${error && error.message ? error.message : String(error)}`, true);
    }
  }

  if (createBtn) {
    createBtn.onclick = () => openBattlePage('create', getPlayerName());
  }
  if (aiBtn) {
    aiBtn.onclick = () => openBattlePage('ai', getPlayerName());
  }
  if (joinBtn) {
    joinBtn.onclick = () => {
      const selectedCode = publicRoomSelect ? String(publicRoomSelect.value || '').trim() : '';
      const typedCode = roomCodeInput ? String(roomCodeInput.value || '').trim() : '';
      const code = typedCode || selectedCode;
      if (!/^\d{4}$/.test(code)) {
        setMessage('请输入有效的 4 位房间号。', true);
        return;
      }
      const knownRoom = findPublicRoom(code);
      if (knownRoom && normalizeJoinableReason(knownRoom) !== 'ok') {
        setMessage(`房间 ${code} 当前不可加入：${getJoinableReasonText(normalizeJoinableReason(knownRoom))}`, true);
        return;
      }
      openBattlePage('join', getPlayerName(), code);
    };
  }
  if (replaysBtn) {
    replaysBtn.onclick = () => openStandalonePage('replays.html', '正在打开对局回放...');
  }
  if (workshopBtn) {
    workshopBtn.onclick = () => openStandalonePage('workshop.html', '正在打开角色工坊...');
  }
  if (publicRoomSelect) {
    publicRoomSelect.onchange = () => {
      const code = String(publicRoomSelect.value || '').trim();
      if (roomCodeInput && /^\d{4}$/.test(code)) {
        roomCodeInput.value = code;
      }
    };
  }
  if (refreshPublicRoomsBtn) {
    refreshPublicRoomsBtn.onclick = () => {
      refreshPublicRooms(true);
    };
  }
  if (authRegisterBtn) {
    authRegisterBtn.onclick = () => {
      runAuthAction('register');
    };
  }
  if (authLoginBtn) {
    authLoginBtn.onclick = () => {
      runAuthAction('login');
    };
  }
  if (authLogoutBtn) {
    authLogoutBtn.onclick = () => {
      runAuthAction('logout');
    };
  }

  refreshPublicRooms(false);
  renderAuthStatus();

  if (authApi) {
    authApi.fetchMe().finally(renderAuthStatus);
    windowRef.addEventListener(authApi.AUTH_EVENT, () => {
      renderAuthStatus();
      refreshPublicRooms(false);
    });
  }

  refreshTimer = windowRef.setInterval(() => {
    if (shellApi && typeof shellApi.isBattleVisible === 'function' && shellApi.isBattleVisible()) {
      return;
    }
    refreshPublicRooms(false);
  }, 15000);

  return Object.freeze({
    refreshPublicRooms,
    renderAuthStatus,
    dispose() {
      if (refreshTimer) {
        windowRef.clearInterval(refreshTimer);
        refreshTimer = 0;
      }
    },
  });
}
