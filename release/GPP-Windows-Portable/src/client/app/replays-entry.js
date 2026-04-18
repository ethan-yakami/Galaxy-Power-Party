import { evaluateRuntimeSources, loadRuntimeSources } from './runtime-source-loader.js';
import { REPLAYS_RUNTIME_SCRIPTS } from './runtime-source-manifest.js';
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
  };
}

function markDiagnostics(diagnostics, key) {
  if (!diagnostics || !key || diagnostics[key]) return;
  diagnostics[key] = Date.now();
}

function logDiagnostics(windowRef, diagnostics) {
  const summary = {
    runtime_boot_ms: diagnostics.app_runtime_ready_at - diagnostics.app_bootstrap_started_at,
    first_interactive_render_ms: diagnostics.first_interactive_render_at - diagnostics.app_bootstrap_started_at,
    total_since_html_ms: diagnostics.first_interactive_render_at - diagnostics.html_loaded_at,
  };
  console.info('[replays-entry] startup_timing_summary', summary);
  windowRef.__GPP_REPLAYS_APP__ = {
    startupTiming: diagnostics,
    summary,
  };
}

function renderBootstrapFailure(documentRef, message) {
  const subtitleEl = documentRef.getElementById('detailSubtitle');
  if (subtitleEl) {
    subtitleEl.textContent = message;
  }
  const cloudHint = documentRef.getElementById('cloudHint');
  if (cloudHint) {
    cloudHint.textContent = '启动失败';
  }
}

async function bootstrapReplaysApp(windowRef) {
  installRuntimeConfig(windowRef);
  const diagnostics = createDiagnostics(windowRef);

  markDiagnostics(diagnostics, 'app_bootstrap_started_at');
  const loaded = await loadRuntimeSources({
    documentRef: windowRef.document,
    sources: REPLAYS_RUNTIME_SCRIPTS,
  });
  evaluateRuntimeSources(windowRef, loaded.sources);
  markDiagnostics(diagnostics, 'app_runtime_ready_at');
  markDiagnostics(diagnostics, 'first_interactive_render_at');
  logDiagnostics(windowRef, diagnostics);
}

const windowRef = /** @type {any} */ (globalThis);

bootstrapReplaysApp(windowRef).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error('[replays-entry] Failed to bootstrap replays app:', reason);
  renderBootstrapFailure(windowRef.document, `回放页初始化失败：${reason}`);
});
