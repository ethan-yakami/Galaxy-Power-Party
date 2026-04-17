import { createBattleApp } from './create-battle-app.js';
import { installRuntimeConfig } from './install-runtime-config.js';

const windowRef = /** @type {any} */ (globalThis);
installRuntimeConfig(windowRef);

try {
  if (windowRef.parent && windowRef.parent !== windowRef && windowRef.parent.__GPP_APP__) {
    windowRef.__GPP_APP__ = windowRef.parent.__GPP_APP__;
  }
} catch {
  // Ignore cross-origin parent access errors.
}

createBattleApp({
  document: windowRef.document,
  location: windowRef.location,
  windowRef,
}).then(() => {
  if (windowRef.GPP) {
    windowRef.GPPEmbeddedShell = {
      start(intent) {
        if (windowRef.GPP && typeof windowRef.GPP.beginShellLaunch === 'function') {
          return windowRef.GPP.beginShellLaunch(intent);
        }
        return false;
      },
      resetToLauncher() {
        if (windowRef.GPP && typeof windowRef.GPP.resetToLauncher === 'function') {
          return windowRef.GPP.resetToLauncher();
        }
        return false;
      },
      getStatus() {
        if (windowRef.GPP && typeof windowRef.GPP.getEmbeddedShellStatus === 'function') {
          return windowRef.GPP.getEmbeddedShellStatus();
        }
        return { ok: false };
      },
    };
  }
  try {
    if (windowRef.parent && windowRef.parent !== windowRef) {
      windowRef.parent.postMessage({ type: 'gpp:battle-shell-ready' }, windowRef.location.origin || '*');
    }
  } catch {
    // Ignore cross-origin postMessage restrictions in standalone mode.
  }
}).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error('[battle-entry] Failed to bootstrap battle app:', reason);

  const messageEl = windowRef.document && windowRef.document.getElementById('message');
  if (messageEl) {
    messageEl.textContent = `战斗页启动失败：${reason}`;
  }

  const errorEl = windowRef.document && windowRef.document.getElementById('connectionError');
  if (errorEl) {
    errorEl.textContent = reason;
    errorEl.classList.remove('hidden');
  }
});
