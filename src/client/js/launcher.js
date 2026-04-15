(function() {
  const nameInput = document.getElementById('nameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const aiBtn = document.getElementById('aiBtn');
  const replaysBtn = document.getElementById('replaysBtn');
  const workshopBtn = document.getElementById('workshopBtn');
  const messageEl = document.getElementById('launcherMessage');

  function setMessage(text, isError) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.toggle('error', !!isError);
  }

  function getPlayerName() {
    const raw = nameInput ? nameInput.value.trim() : '';
    if (raw) return raw.slice(0, 20);
    return '玩家' + Math.floor(Math.random() * 1000);
  }

  function openInNewTab(url, successText) {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      setMessage('浏览器拦截了新标签页，已在当前页跳转。');
      location.href = url;
      return;
    }

    setMessage(successText);
    try {
      win.focus();
    } catch (error) {
      void error;
    }
  }

  function openBattlePage(mode, name, code) {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('name', name);
    if (code) params.set('code', code);

    openInNewTab(
      location.origin + '/battle.html?' + params.toString(),
      '已打开战斗页，请在新标签页进行对战。'
    );
  }

  function openStandalonePage(path, successText) {
    openInNewTab(location.origin + path, successText);
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
      const code = roomCodeInput ? roomCodeInput.value.trim() : '';
      if (!/^\d{4}$/.test(code)) {
        setMessage('请输入有效的 4 位房间号。', true);
        return;
      }
      openBattlePage('join', getPlayerName(), code);
    };
  }

  if (replaysBtn) {
    replaysBtn.onclick = function() {
      openStandalonePage('/replays.html', '已打开对局回放页。');
    };
  }

  if (workshopBtn) {
    workshopBtn.onclick = function() {
      openStandalonePage('/workshop.html', '已打开角色工坊。');
    };
  }
})();
