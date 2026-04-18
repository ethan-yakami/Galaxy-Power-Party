import { evaluateRuntimeSources, loadRuntimeSources } from './runtime-source-loader.js';
import { WORKSHOP_RUNTIME_SCRIPTS } from './runtime-source-manifest.js';
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
  console.info('[workshop-entry] startup_timing_summary', summary);
  windowRef.__GPP_WORKSHOP_APP__ = {
    startupTiming: diagnostics,
    summary,
  };
}

function renderBootstrapFailure(documentRef, message) {
  const messageEl = documentRef.getElementById('workshopMessage');
  if (messageEl) {
    messageEl.textContent = message;
  }
  for (const control of documentRef.querySelectorAll('button, input, select')) {
    if ('disabled' in control) {
      control.disabled = true;
    }
  }
}

async function bootstrapWorkshopApp(windowRef) {
  installRuntimeConfig(windowRef);
  const diagnostics = createDiagnostics(windowRef);

  markDiagnostics(diagnostics, 'app_bootstrap_started_at');
  const loaded = await loadRuntimeSources({
    documentRef: windowRef.document,
    sources: WORKSHOP_RUNTIME_SCRIPTS,
  });
  evaluateRuntimeSources(windowRef, loaded.sources);
  markDiagnostics(diagnostics, 'app_runtime_ready_at');
  markDiagnostics(diagnostics, 'first_interactive_render_at');
  logDiagnostics(windowRef, diagnostics);
}

const windowRef = /** @type {any} */ (globalThis);

bootstrapWorkshopApp(windowRef).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error('[workshop-entry] Failed to bootstrap workshop app:', reason);
  renderBootstrapFailure(windowRef.document, `工坊页初始化失败：${reason}`);
});
