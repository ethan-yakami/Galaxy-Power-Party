import urlUtilsSource from '../js/url-utils.js?raw';
import presetSchemaSource from '../js/preset-schema.js?raw';
import authSource from '../js/auth.js?raw';
import launcherSource from '../js/launcher.js?raw';
import { createLauncherBattleShell } from './create-launcher-battle-shell.js';
import { evalLegacySource } from './eval-legacy-source.js';
import { installRuntimeConfig } from './install-runtime-config.js';

const LAUNCHER_RUNTIME_SOURCES = Object.freeze([
  { src: 'js/url-utils.js', code: urlUtilsSource },
  { src: 'js/preset-schema.js', code: presetSchemaSource },
  { src: 'js/auth.js', code: authSource },
  { src: 'js/launcher.js', code: launcherSource },
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
    launcher_click_at: 0,
    battle_shell_visible_at: 0,
    socket_ready_at: 0,
    room_request_sent_at: 0,
    room_state_received_at: 0,
    room_reconciled_at: 0,
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
  console.info('[launcher-entry] startup_timing_summary', summary);
  windowRef.__GPP_LAUNCHER_APP__ = {
    startupTiming: diagnostics,
    summary,
  };
}

const windowRef = /** @type {any} */ (globalThis);
installRuntimeConfig(windowRef);
const diagnostics = createDiagnostics(windowRef);

markDiagnostics(diagnostics, 'app_bootstrap_started_at');
for (const source of LAUNCHER_RUNTIME_SOURCES.slice(0, 3)) {
  const url = new URL(source.src, windowRef.document.baseURI).toString();
  evalLegacySource(windowRef, url, source.code);
}
windowRef.GPPShell = createLauncherBattleShell({
  diagnostics,
  documentRef: windowRef.document,
  windowRef,
});
const launcherSourceUrl = new URL(LAUNCHER_RUNTIME_SOURCES[3].src, windowRef.document.baseURI).toString();
evalLegacySource(windowRef, launcherSourceUrl, LAUNCHER_RUNTIME_SOURCES[3].code);
markDiagnostics(diagnostics, 'app_runtime_ready_at');
markDiagnostics(diagnostics, 'first_interactive_render_at');
logDiagnostics(windowRef, diagnostics);
