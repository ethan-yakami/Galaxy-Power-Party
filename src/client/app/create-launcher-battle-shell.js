const READY_TIMEOUT_MS = 8000;

function parseBattleIntentFromLocation(windowRef) {
  const params = new URLSearchParams(windowRef.location.search || '');
  const mode = String(params.get('mode') || '').trim();
  if (!mode) return null;

  const name = String(params.get('name') || '').trim();
  if (mode === 'join') {
    const code = String(params.get('code') || '').trim();
    if (!code) return null;
    return { mode, name, code };
  }
  if (mode === 'replay') {
    const replayId = String(params.get('replayId') || '').trim();
    return { mode, name, replayId };
  }
  return { mode, name };
}

function buildBattlePath(urls, intent, locationRef) {
  const params = new URLSearchParams();
  params.set('mode', intent.mode);
  if (intent.name) params.set('name', intent.name);
  if (intent.code) params.set('code', intent.code);
  if (intent.replayId) params.set('replayId', intent.replayId);
  return urls.toPath(`battle.html?${params.toString()}`, locationRef);
}

function setTimeField(target, key, value = Date.now()) {
  if (!target || !key || target[key]) return;
  target[key] = value;
}

/**
 * @param {{
 *   diagnostics: Record<string, number>,
 *   documentRef: Document,
 *   windowRef: any,
 * }} options
 */
export function createLauncherBattleShell(options) {
  const { diagnostics, documentRef, windowRef } = options;
  const urls = windowRef.GPPUrls || {
    getBasePath() {
      return '/';
    },
    toPath(path) {
      return `/${String(path || '').replace(/^\/+/, '')}`;
    },
  };
  const launcherShell = documentRef.querySelector('.launcherShell');
  const launcherBg = documentRef.querySelector('.launcherBg');
  const appRoot = windowRef.__GPP_APP__ && typeof windowRef.__GPP_APP__ === 'object'
    ? windowRef.__GPP_APP__
    : {};
  appRoot.startupTiming = diagnostics;
  windowRef.__GPP_APP__ = appRoot;

  const host = documentRef.createElement('div');
  host.id = 'gppBattleShellHost';
  host.className = 'gppBattleShellHost hidden';

  const overlay = documentRef.createElement('div');
  overlay.className = 'gppBattleShellOverlay';
  overlay.innerHTML = [
    '<div class="gppBattleShellOverlayCard">',
    '  <p class="gppBattleShellOverlaySub">GALAXY POWER PARTY</p>',
    '  <h2 id="gppBattleShellOverlayTitle">正在预热战斗壳层...</h2>',
    '  <p id="gppBattleShellOverlayText">正在初始化战斗运行时，请稍候。</p>',
    '  <div id="gppBattleShellOverlayActions" class="gppBattleShellOverlayActions hidden">',
    '    <button id="gppBattleShellRetryBtn" type="button" class="secondaryBtn">重试壳层</button>',
    '    <button id="gppBattleShellStandaloneBtn" type="button" class="primaryBtn">直接打开战斗页</button>',
    '  </div>',
    '</div>',
  ].join('');

  const frame = documentRef.createElement('iframe');
  frame.id = 'gppBattleShellFrame';
  frame.className = 'gppBattleShellFrame';
  frame.title = 'Galaxy Power Party Battle Shell';
  frame.src = urls.toPath('battle.html?shell=1', windowRef.location);
  frame.setAttribute('aria-hidden', 'true');

  host.appendChild(frame);
  host.appendChild(overlay);
  documentRef.body.appendChild(host);

  const overlayTitleEl = /** @type {HTMLHeadingElement | null} */ (documentRef.getElementById('gppBattleShellOverlayTitle'));
  const overlayTextEl = /** @type {HTMLParagraphElement | null} */ (documentRef.getElementById('gppBattleShellOverlayText'));
  const overlayActionsEl = /** @type {HTMLDivElement | null} */ (documentRef.getElementById('gppBattleShellOverlayActions'));
  const retryBtn = /** @type {HTMLButtonElement | null} */ (documentRef.getElementById('gppBattleShellRetryBtn'));
  const standaloneBtn = /** @type {HTMLButtonElement | null} */ (documentRef.getElementById('gppBattleShellStandaloneBtn'));

  let ready = false;
  let visible = false;
  let pendingIntent = null;
  let lastIntent = null;
  let readyTimer = 0;

  function clearReadyTimeout() {
    if (readyTimer) {
      windowRef.clearTimeout(readyTimer);
      readyTimer = 0;
    }
  }

  function setOverlayState(title, text, showActions = false) {
    if (overlayTitleEl) overlayTitleEl.textContent = title || '';
    if (overlayTextEl) overlayTextEl.textContent = text || '';
    if (overlayActionsEl) overlayActionsEl.classList.toggle('hidden', !showActions);
    overlay.classList.toggle('gppBattleShellOverlayInteractive', !!showActions);
  }

  function showOverlay(title, text, showActions = false) {
    overlay.classList.remove('hidden');
    setOverlayState(title, text, showActions);
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    setOverlayState('', '', false);
  }

  function markTiming(key) {
    setTimeField(diagnostics, key);
  }

  function getEmbeddedShell() {
    try {
      const shell = frame.contentWindow && frame.contentWindow.GPPEmbeddedShell;
      return shell && typeof shell === 'object' ? shell : null;
    } catch {
      return null;
    }
  }

  function buildIntentCopy(intent) {
    if (!intent) {
      return {
        title: '正在准备战斗页...',
        text: '正在初始化战斗运行时，请稍候。',
      };
    }
    if (intent.mode === 'join') {
      return {
        title: `正在加入房间 ${intent.code}...`,
        text: '正在向战斗页发送入房请求，请稍候。',
      };
    }
    if (intent.mode === 'ai') {
      return {
        title: '正在创建 AI 房间...',
        text: '战斗页就绪后会自动打开 AI 对战房间。',
      };
    }
    if (intent.mode === 'resume_room' || intent.mode === 'resume_local') {
      return {
        title: '正在恢复对局...',
        text: '正在根据快照恢复战斗房间，请稍候。',
      };
    }
    if (intent.mode === 'replay') {
      return {
        title: '正在打开回放...',
        text: '战斗页就绪后会自动载入回放。',
      };
    }
    return {
      title: '正在创建房间...',
      text: '正在向战斗页发送建房请求，请稍候。',
    };
  }

  function armReadyTimeout(intent) {
    clearReadyTimeout();
    readyTimer = windowRef.setTimeout(() => {
      const fallbackIntent = intent || pendingIntent || lastIntent;
      showOverlay(
        '战斗壳层启动较慢',
        fallbackIntent
          ? '战斗页预热超时。你可以重试壳层，或直接打开独立战斗页继续入房。'
          : '战斗页预热超时。你可以返回启动页后重试。',
        !!fallbackIntent
      );
    }, READY_TIMEOUT_MS);
  }

  function showBattleHost() {
    visible = true;
    host.classList.remove('hidden');
    launcherShell && launcherShell.classList.add('hidden');
    launcherBg && launcherBg.classList.add('hidden');
    frame.setAttribute('aria-hidden', 'false');
    markTiming('battle_shell_visible_at');
  }

  function showLauncherShell() {
    visible = false;
    host.classList.add('hidden');
    launcherShell && launcherShell.classList.remove('hidden');
    launcherBg && launcherBg.classList.remove('hidden');
    frame.setAttribute('aria-hidden', 'true');
    clearReadyTimeout();
    pendingIntent = null;
    hideOverlay();
  }

  function startIntent(intent) {
    if (!intent || typeof intent !== 'object' || !intent.mode) return false;
    showBattleHost();
    const copy = buildIntentCopy(intent);
    showOverlay(copy.title, copy.text, false);
    const shell = getEmbeddedShell();
    if (!shell || typeof shell.start !== 'function') {
      pendingIntent = { ...intent };
      armReadyTimeout(intent);
      return false;
    }
    const started = shell.start(intent);
    if (!started) {
      pendingIntent = { ...intent };
      armReadyTimeout(intent);
      return false;
    }
    pendingIntent = null;
    armReadyTimeout(intent);
    return true;
  }

  function openStandaloneBattle(intent) {
    if (!intent) return false;
    windowRef.location.assign(buildBattlePath(urls, intent, windowRef.location));
    return true;
  }

  function openBattleIntent(intent) {
    if (!intent || typeof intent !== 'object' || !intent.mode) return false;
    lastIntent = { ...intent };
    markTiming('launcher_click_at');
    windowRef.history.pushState(
      { gppView: 'battle', intent: lastIntent },
      '',
      buildBattlePath(urls, lastIntent, windowRef.location)
    );
    return startIntent(lastIntent);
  }

  function resetEmbeddedShell() {
    const shell = getEmbeddedShell();
    if (shell && typeof shell.resetToLauncher === 'function') {
      shell.resetToLauncher();
    }
  }

  function navigateToLauncher(options = {}) {
    if (!options.fromEmbeddedShell) {
      resetEmbeddedShell();
    }
    windowRef.history.pushState({ gppView: 'launcher' }, '', urls.getBasePath(windowRef.location));
    showLauncherShell();
    return true;
  }

  function reloadBattleShellFrame() {
    ready = false;
    clearReadyTimeout();
    hideOverlay();
    frame.src = urls.toPath(`battle.html?shell=1&reload=${Date.now()}`, windowRef.location);
    if (lastIntent) {
      pendingIntent = { ...lastIntent };
      const copy = buildIntentCopy(lastIntent);
      showOverlay(copy.title, copy.text, false);
      armReadyTimeout(lastIntent);
    }
  }

  function syncRoute() {
    const isBattleRoute = /\/battle\.html$/i.test(windowRef.location.pathname);
    if (!isBattleRoute) {
      showLauncherShell();
      return;
    }
    const routeIntent = parseBattleIntentFromLocation(windowRef) || pendingIntent || lastIntent;
    if (!routeIntent) {
      navigateToLauncher({ fromEmbeddedShell: true });
      return;
    }
    lastIntent = { ...routeIntent };
    startIntent(lastIntent);
  }

  if (retryBtn) {
    retryBtn.onclick = () => {
      reloadBattleShellFrame();
    };
  }

  if (standaloneBtn) {
    standaloneBtn.onclick = () => {
      if (lastIntent) {
        openStandaloneBattle(lastIntent);
      }
    };
  }

  windowRef.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const payload = event.data && typeof event.data === 'object' ? event.data : null;
    if (!payload || typeof payload.type !== 'string') return;
    if (payload.type === 'gpp:battle-shell-ready') {
      ready = true;
      clearReadyTimeout();
      hideOverlay();
      if (pendingIntent) {
        const nextIntent = { ...pendingIntent };
        pendingIntent = null;
        startIntent(nextIntent);
      } else if (/\/battle\.html$/i.test(windowRef.location.pathname) && lastIntent) {
        startIntent(lastIntent);
      }
      return;
    }
    if (payload.type === 'gpp:battle-shell-show') {
      clearReadyTimeout();
      hideOverlay();
      return;
    }
    if (payload.type === 'gpp:battle-shell-request-launcher') {
      navigateToLauncher({ fromEmbeddedShell: true });
    }
  });

  windowRef.addEventListener('popstate', () => {
    syncRoute();
  });

  const initialIntent = parseBattleIntentFromLocation(windowRef);
  if (initialIntent) {
    lastIntent = { ...initialIntent };
    showBattleHost();
    startIntent(initialIntent);
  } else {
    showLauncherShell();
  }

  return Object.freeze({
    frame,
    host,
    isBattleVisible() {
      return visible;
    },
    isReady() {
      return ready;
    },
    openBattleIntent,
    navigateToLauncher,
    syncRoute,
    openStandaloneBattle,
  });
}
