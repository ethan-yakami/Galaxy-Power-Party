import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./load-legacy-battle-runtime.js', () => ({
  loadLegacyBattleRuntime: vi.fn(async () => ({
    loaderMode: 'bundle_eval',
    scriptCount: 15,
    startedAt: 100,
    fetchStartedAt: 0,
    fetchCompletedAt: 0,
    completedAt: 120,
  })),
}));

import { createBattleApp } from './create-battle-app.js';
import { loadLegacyBattleRuntime } from './load-legacy-battle-runtime.js';

describe('createBattleApp', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <p id="message"></p>
      <p id="connectionError" class="hidden"></p>
    `;
    delete globalThis.GPP;
    delete globalThis.__GPP_BATTLE_APP__;
  });

  it('installs the compat bridge and keeps launch intent on app state', async () => {
    const app = await createBattleApp({
      document,
      location: /** @type {any} */ (new URL('http://localhost:3000/battle.html?mode=ai&name=%E7%8E%A9%E5%AE%B6535')),
      windowRef: /** @type {any} */ (globalThis),
    });

    expect(app.state.ui.launchIntent).toEqual({
      mode: 'ai',
      name: '玩家535',
    });
    expect(globalThis.GPP.state).toBe(app.state);
    expect(globalThis.__GPP_BATTLE_APP__).toBe(app);
    expect(app.startupTiming.battle_bootstrap_started_at).toBeGreaterThan(0);
    expect(app.startupTiming.battle_runtime_ready_at).toBeGreaterThan(0);
    expect(app.startupTiming.loader_mode).toBe('bundle_eval');
    expect(loadLegacyBattleRuntime).toHaveBeenCalledWith(expect.objectContaining({
      launchMode: 'ai',
    }));
  });
});
