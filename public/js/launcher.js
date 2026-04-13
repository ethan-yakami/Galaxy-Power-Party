(function() {
  const nameInput = document.getElementById('nameInput');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const aiBtn = document.getElementById('aiBtn');
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
    return `玩家${Math.floor(Math.random() * 1000)}`;
  }

  function openBattlePage(mode, name, code) {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('name', name);
    if (code) params.set('code', code);

    const url = `${location.origin}/battle.html?${params.toString()}`;
    const win = window.open(url, '_blank', 'noopener');

    if (!win) {
      setMessage('浏览器拦截了新标签页，已在当前页跳转。');
      location.href = url;
      return;
    }

    setMessage('已打开战斗页，请在新标签页进行对战。');
    try {
      win.focus();
    } catch {}
  }

  function openWorkshopPage() {
    const url = `${location.origin}/workshop.html`;
    const win = window.open(url, '_blank', 'noopener');

    if (!win) {
      setMessage('浏览器拦截了新标签页，已在当前页跳转。');
      location.href = url;
      return;
    }

    setMessage('已打开角色工坊，可创建全局可选的自定义角色。');
    try {
      win.focus();
    } catch {}
  }

  if (createBtn) {
    createBtn.onclick = () => {
      openBattlePage('create', getPlayerName());
    };
  }

  if (aiBtn) {
    aiBtn.onclick = () => {
      openBattlePage('ai', getPlayerName());
    };
  }

  if (joinBtn) {
    joinBtn.onclick = () => {
      const code = roomCodeInput ? roomCodeInput.value.trim() : '';
      if (!/^\d{4}$/.test(code)) {
        setMessage('请输入有效的4位房间号。', true);
        return;
      }
      openBattlePage('join', getPlayerName(), code);
    };
  }

  if (workshopBtn) {
    workshopBtn.hidden = true;
  }
})();
