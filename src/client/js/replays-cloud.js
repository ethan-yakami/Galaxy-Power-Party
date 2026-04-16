(function() {
  const authApi = window.GPPAuth || null;
  const replayHistory = window.GPPReplayHistory || null;
  const dom = {
    authReplayStatus: document.getElementById('authReplayStatus'),
    cloudRefreshBtn: document.getElementById('cloudRefreshBtn'),
    cloudHint: document.getElementById('cloudHint'),
    cloudReplayList: document.getElementById('cloudReplayList'),
  };

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(timestamp) {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return '-';
    }
  }

  function setCloudHint(text) {
    if (!dom.cloudHint) return;
    dom.cloudHint.textContent = text || '';
  }

  function renderAuthStatus() {
    if (!dom.authReplayStatus) return;
    if (!authApi) {
      dom.authReplayStatus.textContent = '账号：当前页面未加载认证模块';
      return;
    }
    const session = authApi.getSession();
    if (session && session.user && session.user.username) {
      dom.authReplayStatus.textContent = `账号：${session.user.username}`;
    } else if (session && session.isAuthenticated) {
      dom.authReplayStatus.textContent = '账号：已登录';
    } else {
      dom.authReplayStatus.textContent = '账号：未登录（可浏览本地回放）';
    }
  }

  function renderCloudList(items) {
    if (!dom.cloudReplayList) return;
    dom.cloudReplayList.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      setCloudHint('当前账号没有云端回放记录。');
      return;
    }
    setCloudHint(`已加载 ${list.length} 条云端回放。`);
    for (const item of list) {
      const li = document.createElement('li');
      li.className = 'historyItem';
      li.innerHTML = [
        `<div><strong>${escapeHtml(item.replayId || '-')}</strong></div>`,
        `<div class="historyLine">房间：${escapeHtml(item.roomCode || '-')} | 模式：${escapeHtml(item.sourceRoomMode || '-')}</div>`,
        `<div class="historyLine">版本：${escapeHtml(item.version || '-')} | 时间：${escapeHtml(fmtTime(item.createdAt))}</div>`,
      ].join('');

      const actions = document.createElement('div');
      actions.className = 'itemActions';

      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'secondaryBtn';
      importBtn.textContent = '导入到本地';
      importBtn.onclick = async () => {
        if (!authApi || !replayHistory) return;
        importBtn.disabled = true;
        importBtn.textContent = '导入中...';
        try {
          const response = await authApi.fetchWithAuth(`/api/replays/${encodeURIComponent(item.replayId || '')}`);
          if (!response.ok) {
            setCloudHint(`导入失败：HTTP ${response.status}`);
            return;
          }
          const payload = await response.json().catch(() => null);
          if (!payload || payload.ok !== true || !payload.replay) {
            setCloudHint('导入失败：回放内容无效。');
            return;
          }
          const entry = replayHistory.upsertReplay(payload.replay);
          if (!entry) {
            setCloudHint('导入失败：本地回放校验未通过。');
            return;
          }
          setCloudHint(`导入成功：${entry.replayId}`);
          window.dispatchEvent(new Event('gpp_replays_local_updated'));
        } catch (error) {
          setCloudHint(`导入失败：${error && error.message ? error.message : String(error)}`);
        } finally {
          importBtn.disabled = false;
          importBtn.textContent = '导入到本地';
        }
      };

      actions.appendChild(importBtn);
      li.appendChild(actions);
      dom.cloudReplayList.appendChild(li);
    }
  }

  async function refreshCloudReplays() {
    if (!authApi) {
      setCloudHint('当前页面未加载认证模块。');
      return;
    }
    const session = authApi.getSession();
    if (!session || !session.isAuthenticated) {
      renderCloudList([]);
      setCloudHint('请先在首页登录后再查看云端回放。');
      return;
    }
    if (dom.cloudRefreshBtn) dom.cloudRefreshBtn.disabled = true;
    setCloudHint('正在加载云端回放...');
    try {
      const response = await authApi.fetchWithAuth('/api/replays');
      if (response.status === 401) {
        renderCloudList([]);
        setCloudHint('登录已过期，请重新登录。');
        return;
      }
      if (!response.ok) {
        renderCloudList([]);
        setCloudHint(`加载失败：HTTP ${response.status}`);
        return;
      }
      const payload = await response.json().catch(() => null);
      renderCloudList(payload && Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      renderCloudList([]);
      setCloudHint(`加载失败：${error && error.message ? error.message : String(error)}`);
    } finally {
      if (dom.cloudRefreshBtn) dom.cloudRefreshBtn.disabled = false;
    }
  }

  if (dom.cloudRefreshBtn) {
    dom.cloudRefreshBtn.onclick = refreshCloudReplays;
  }

  renderAuthStatus();
  if (authApi) {
    authApi.fetchMe().finally(() => {
      renderAuthStatus();
      refreshCloudReplays();
    });
    window.addEventListener(authApi.AUTH_EVENT, () => {
      renderAuthStatus();
      refreshCloudReplays();
    });
  } else {
    refreshCloudReplays();
  }
})();
