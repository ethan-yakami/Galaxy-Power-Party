(function() {
  const nameInput = document.getElementById('nameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const aiBtn = document.getElementById('aiBtn');
  const replaysBtn = document.getElementById('replaysBtn');
  const workshopBtn = document.getElementById('workshopBtn');
  const messageEl = document.getElementById('launcherMessage');
  const publicRoomSelect = document.getElementById('publicRoomSelect');
  const refreshPublicRoomsBtn = document.getElementById('refreshPublicRoomsBtn');
  const publicRoomsHint = document.getElementById('publicRoomsHint');
  const authStatusText = document.getElementById('authStatusText');
  const authUsernameInput = document.getElementById('authUsernameInput');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const authRegisterBtn = document.getElementById('authRegisterBtn');
  const authLoginBtn = document.getElementById('authLoginBtn');
  const authLogoutBtn = document.getElementById('authLogoutBtn');
  const authApi = window.GPPAuth || null;

  function setMessage(text, isError) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.toggle('error', !!isError);
  }

  function getPlayerName() {
    const raw = nameInput ? nameInput.value.trim() : '';
    if (raw) return raw.slice(0, 20);
    return `玩家${Math.floor(Math.random() * 1000)}`;
  }

  function navigate(url, successText) {
    if (successText) setMessage(successText, false);
    location.href = url;
  }

  function openBattlePage(mode, name, code) {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('name', name);
    if (code) params.set('code', code);
    navigate(`${location.origin}/battle.html?${params.toString()}`, '正在进入战斗房间...');
  }

  function openStandalonePage(path, successText) {
    navigate(`${location.origin}${path}`, successText);
  }

  function renderPublicRooms(rooms) {
    if (!publicRoomSelect) return;
    const list = Array.isArray(rooms) ? rooms : [];
    publicRoomSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? '选择可加入房间...' : '暂无可加入房间';
    publicRoomSelect.appendChild(placeholder);

    for (const room of list) {
      const option = document.createElement('option');
      option.value = room.code;
      const status = room.status === 'lobby' ? '大厅' : (room.status || '未知');
      option.textContent = `${room.code} | ${status} | ${room.playerCount || 0}/2`;
      publicRoomSelect.appendChild(option);
    }

    if (publicRoomsHint) {
      publicRoomsHint.textContent = list.length
        ? `当前可加入 ${list.length} 个房间，选择后会自动填入房号。`
        : '暂无可加入房间，稍后刷新重试。';
    }
  }

  async function refreshPublicRooms(showMessage) {
    if (refreshPublicRoomsBtn) refreshPublicRoomsBtn.disabled = true;
    try {
      const response = await fetch(`/api/public-rooms?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const list = Array.isArray(payload && payload.rooms) ? payload.rooms : [];
      const joinableRooms = list.filter((item) => item && item.joinable);
      renderPublicRooms(joinableRooms);
      if (showMessage) {
        setMessage(joinableRooms.length ? '公开房间列表已刷新。' : '当前没有可加入的公开房间。', false);
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
    const username = authUsernameInput ? String(authUsernameInput.value || '').trim() : '';
    const password = authPasswordInput ? String(authPasswordInput.value || '') : '';
    return { username, password };
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
    } catch (error) {
      setMessage(`账号操作失败：${error && error.message ? error.message : String(error)}`, true);
    }
  }

  if (createBtn) {
    createBtn.onclick = function() {
      openBattlePage('create', getPlayerName());
    };
  }

  if (aiBtn) {
    aiBtn.onclick = function() {
      openBattlePage('ai', getPlayerName());
    };
  }

  if (joinBtn) {
    joinBtn.onclick = function() {
      const selectedCode = publicRoomSelect ? String(publicRoomSelect.value || '').trim() : '';
      const typedCode = roomCodeInput ? roomCodeInput.value.trim() : '';
      const code = typedCode || selectedCode;
      if (!/^\d{4}$/.test(code)) {
        setMessage('请输入有效的 4 位房间号。', true);
        return;
      }
      openBattlePage('join', getPlayerName(), code);
    };
  }

  if (replaysBtn) {
    replaysBtn.onclick = function() {
      openStandalonePage('/replays.html', '正在打开对局回放...');
    };
  }

  if (workshopBtn) {
    workshopBtn.onclick = function() {
      openStandalonePage('/workshop.html', '正在打开角色工坊...');
    };
  }

  if (publicRoomSelect) {
    publicRoomSelect.onchange = function() {
      const code = String(publicRoomSelect.value || '').trim();
      if (roomCodeInput && /^\d{4}$/.test(code)) {
        roomCodeInput.value = code;
      }
    };
  }

  if (refreshPublicRoomsBtn) {
    refreshPublicRoomsBtn.onclick = function() {
      refreshPublicRooms(true);
    };
  }

  if (authRegisterBtn) {
    authRegisterBtn.onclick = function() {
      runAuthAction('register');
    };
  }

  if (authLoginBtn) {
    authLoginBtn.onclick = function() {
      runAuthAction('login');
    };
  }

  if (authLogoutBtn) {
    authLogoutBtn.onclick = function() {
      runAuthAction('logout');
    };
  }

  refreshPublicRooms(false);
  renderAuthStatus();
  if (authApi) {
    authApi.fetchMe().finally(renderAuthStatus);
    window.addEventListener(authApi.AUTH_EVENT, renderAuthStatus);
  }
  setInterval(() => {
    refreshPublicRooms(false);
  }, 15000);
})();
