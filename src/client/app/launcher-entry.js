import { createLauncherBattleShell } from './create-launcher-battle-shell.js';
import { evaluateRuntimeSources, loadRuntimeSources } from './runtime-source-loader.js';
import { LAUNCHER_RUNTIME_SCRIPTS } from './runtime-source-manifest.js';
import { installRuntimeConfig } from './install-runtime-config.js';

function createDiagnostics(windowRef) {
  const htmlLoadedAt = Number(windowRef.performance && typeof windowRef.performance.timeOrigin === 'number')
    ? Math.round(windowRef.performance.timeOrigin)
    : Date.now();
  return {
    html_loaded_at: htmlLoadedAt,
    app_bootstrap_started_at: 0,
    app_runtime_ready_at: 0,
    first_interactive_render_at: 0,
    launcher_click_at: 0,
    battle_shell_visible_at: 0,
    socket_ready_at: 0,
    room_request_sent_at: 0,
    room_state_received_at: 0,
    room_reconciled_at: 0,
  };
}

function createFrontendDiagnostics() {
  return {
    appVersion: 'unknown',
    entryMode: 'source-module',
    diagnosticsUrl: '/api/frontend-diagnostics',
    versionUrl: '/api/version',
    runtimeSources: {
      critical: 'pending',
      launcher: 'pending',
    },
    bootstrapStatus: 'booting',
    lastError: '',
    checkedAt: Date.now(),
  };
}

function ensureAppState(windowRef) {
  if (!windowRef.__GPP_APP__ || typeof windowRef.__GPP_APP__ !== 'object') {
    windowRef.__GPP_APP__ = {};
  }
  return windowRef.__GPP_APP__;
}

function markDiagnostics(diagnostics, key) {
  if (!diagnostics || !key || diagnostics[key]) return;
  diagnostics[key] = Date.now();
}

function renderFrontendDiagnostics(documentRef, frontendDiagnostics) {
  const diagnosticsEl = documentRef.getElementById('launcherDiagnostics');
  if (!diagnosticsEl) return;
  const parts = [
    `frontend ${frontendDiagnostics.appVersion || 'unknown'}`,
    `mode ${frontendDiagnostics.entryMode || 'unknown'}`,
    `critical ${frontendDiagnostics.runtimeSources.critical}`,
    `launcher ${frontendDiagnostics.runtimeSources.launcher}`,
    `status ${frontendDiagnostics.bootstrapStatus}`,
  ];
  if (frontendDiagnostics.lastError) {
    parts.push(`error ${frontendDiagnostics.lastError}`);
  }
  diagnosticsEl.textContent = parts.join(' | ');
}

async function hydrateFrontendDiagnostics(windowRef, frontendDiagnostics) {
  const fetchImpl = typeof windowRef.fetch === 'function' ? windowRef.fetch.bind(windowRef) : null;
  if (!fetchImpl) {
    renderFrontendDiagnostics(windowRef.document, frontendDiagnostics);
    return frontendDiagnostics;
  }

  try {
    const [frontendResponse, versionResponse] = await Promise.all([
      fetchImpl(frontendDiagnostics.diagnosticsUrl, { cache: 'no-store', credentials: 'same-origin' }),
      fetchImpl(frontendDiagnostics.versionUrl, { cache: 'no-store', credentials: 'same-origin' }),
    ]);

    if (frontendResponse.ok) {
      const frontendPayload = await frontendResponse.json();
      const frontend = frontendPayload && frontendPayload.frontend ? frontendPayload.frontend : null;
      if (frontend) {
        frontendDiagnostics.entryMode = frontend.servedMode || frontend.expectedMode || frontendDiagnostics.entryMode;
      }
    }

    if (versionResponse.ok) {
      const versionPayload = await versionResponse.json();
      if (versionPayload && versionPayload.app && versionPayload.app.version) {
        frontendDiagnostics.appVersion = versionPayload.app.version;
      }
    }
  } catch (error) {
    frontendDiagnostics.lastError = error instanceof Error ? error.message : String(error);
  }

  frontendDiagnostics.checkedAt = Date.now();
  renderFrontendDiagnostics(windowRef.document, frontendDiagnostics);
  return frontendDiagnostics;
}

function logDiagnostics(windowRef, diagnostics, frontendDiagnostics) {
  const summary = {
    runtime_boot_ms: diagnostics.app_runtime_ready_at - diagnostics.app_bootstrap_started_at,
    first_interactive_render_ms: diagnostics.first_interactive_render_at - diagnostics.app_bootstrap_started_at,
    total_since_html_ms: diagnostics.first_interactive_render_at - diagnostics.html_loaded_at,
  };
  console.info('[launcher-entry] startup_timing_summary', summary);
  console.info('[launcher-entry] frontend_diagnostics', frontendDiagnostics);
  windowRef.__GPP_LAUNCHER_APP__ = {
    startupTiming: diagnostics,
    frontendDiagnostics,
    summary,
  };
}

function renderBootstrapFailure(documentRef, message, frontendDiagnostics) {
  const launcherMessage = documentRef.getElementById('launcherMessage');
  if (launcherMessage) {
    launcherMessage.textContent = message;
    launcherMessage.classList.add('error');
  }
  renderFrontendDiagnostics(documentRef, frontendDiagnostics);
  for (const control of documentRef.querySelectorAll('button, input, select')) {
    if ('disabled' in control) {
      control.disabled = true;
    }
  }
}

async function bootstrapLauncherApp(windowRef) {
  installRuntimeConfig(windowRef);
  const appState = ensureAppState(windowRef);
  const diagnostics = createDiagnostics(windowRef);
  const frontendDiagnostics = createFrontendDiagnostics();
  appState.frontendDiagnostics = frontendDiagnostics;
  renderFrontendDiagnostics(windowRef.document, frontendDiagnostics);
  markDiagnostics(diagnostics, 'app_bootstrap_started_at');
  await hydrateFrontendDiagnostics(windowRef, frontendDiagnostics);

  const criticalSources = await loadRuntimeSources({
    documentRef: windowRef.document,
    sources: LAUNCHER_RUNTIME_SCRIPTS.slice(0, 3),
  });
  evaluateRuntimeSources(windowRef, criticalSources.sources);
  frontendDiagnostics.runtimeSources.critical = 'ok';
  renderFrontendDiagnostics(windowRef.document, frontendDiagnostics);

  windowRef.GPPShell = createLauncherBattleShell({
    diagnostics,
    documentRef: windowRef.document,
    windowRef,
  });

  const launcherSources = await loadRuntimeSources({
    documentRef: windowRef.document,
    sources: LAUNCHER_RUNTIME_SCRIPTS.slice(3),
  });
  evaluateRuntimeSources(windowRef, launcherSources.sources);
  frontendDiagnostics.runtimeSources.launcher = 'ok';
  frontendDiagnostics.bootstrapStatus = 'ready';

  markDiagnostics(diagnostics, 'app_runtime_ready_at');
  markDiagnostics(diagnostics, 'first_interactive_render_at');
  renderFrontendDiagnostics(windowRef.document, frontendDiagnostics);
  logDiagnostics(windowRef, diagnostics, frontendDiagnostics);
}

const windowRef = /** @type {any} */ (globalThis);

bootstrapLauncherApp(windowRef).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  const appState = ensureAppState(windowRef);
  const frontendDiagnostics = appState.frontendDiagnostics || createFrontendDiagnostics();
  frontendDiagnostics.bootstrapStatus = 'failed';
  frontendDiagnostics.lastError = reason;
  console.error('[launcher-entry] Failed to bootstrap launcher app:', error);
  windowRef.GPPShell = Object.freeze({
    isBattleVisible() {
      return false;
    },
    isReady() {
      return false;
    },
    openBattleIntent() {
      return false;
    },
    navigateToLauncher() {
      return false;
    },
    syncRoute() {
      return false;
    },
    openStandaloneBattle() {
      return false;
    },
  });
  renderBootstrapFailure(
    windowRef.document,
    `Launcher bootstrap failed: ${reason}. Check the browser console and /api/frontend-diagnostics.`,
    frontendDiagnostics,
  );
});
