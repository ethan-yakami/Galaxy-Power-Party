import { createBattleApp } from './create-battle-app.js';

createBattleApp({
  document: globalThis.document,
  location: globalThis.location,
  windowRef: /** @type {any} */ (globalThis),
}).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error('[battle-entry] Failed to bootstrap battle app:', reason);

  const messageEl = globalThis.document && globalThis.document.getElementById('message');
  if (messageEl) {
    messageEl.textContent = `Battle app bootstrap failed: ${reason}`;
  }

  const errorEl = globalThis.document && globalThis.document.getElementById('connectionError');
  if (errorEl) {
    errorEl.textContent = reason;
    errorEl.classList.remove('hidden');
  }
});
