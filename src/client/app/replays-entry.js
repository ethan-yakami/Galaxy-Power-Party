import urlUtilsSource from '../js/url-utils.js?raw';
import replaySchemaSource from '../js/replay-schema.js?raw';
import authSource from '../js/auth.js?raw';
import replayHistorySource from '../js/replay-history.js?raw';
import replaysSource from '../js/replays.js?raw';
import replaysCloudSource from '../js/replays-cloud.js?raw';
import { evalLegacySource } from './eval-legacy-source.js';
import { installRuntimeConfig } from './install-runtime-config.js';

const REPLAYS_RUNTIME_SOURCES = Object.freeze([
  { src: 'js/url-utils.js', code: urlUtilsSource },
  { src: 'shared/replay-schema.js', code: replaySchemaSource },
  { src: 'js/auth.js', code: authSource },
  { src: 'js/replay-history.js', code: replayHistorySource },
  { src: 'js/replays.js', code: replaysSource },
  { src: 'js/replays-cloud.js', code: replaysCloudSource },
]);

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

const windowRef = /** @type {any} */ (globalThis);
installRuntimeConfig(windowRef);
const diagnostics = createDiagnostics(windowRef);

markDiagnostics(diagnostics, 'app_bootstrap_started_at');
for (const source of REPLAYS_RUNTIME_SOURCES) {
  const url = new URL(source.src, windowRef.document.baseURI).toString();
  evalLegacySource(windowRef, url, source.code);
}
markDiagnostics(diagnostics, 'app_runtime_ready_at');
markDiagnostics(diagnostics, 'first_interactive_render_at');
logDiagnostics(windowRef, diagnostics);
