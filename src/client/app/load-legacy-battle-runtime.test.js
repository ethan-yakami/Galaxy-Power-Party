import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRuntimeSourceCache } from './runtime-source-loader.js';
import { BATTLE_RUNTIME_SCRIPTS, loadBattleRuntime } from './load-battle-runtime.js';

describe('loadBattleRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.GPP;
    clearRuntimeSourceCache();
  });

  it('fetches and evaluates the critical battle runtime and installs deferred feature loaders', async () => {
    const fetchMock = vi.fn(async (input) => ({
      ok: true,
      status: 200,
      async text() {
        return `window.__runtimeLoads = (window.__runtimeLoads || []); window.__runtimeLoads.push(${JSON.stringify(String(input))});`;
      },
    }));
    const evalMock = vi.fn();
    Object.defineProperty(document, 'baseURI', {
      configurable: true,
      value: 'http://localhost:3000/battle.html',
    });
    Object.assign(window, {
      GPP: {},
      fetch: fetchMock,
      eval: evalMock,
    });

    const metrics = await loadBattleRuntime({
      document,
      launchMode: 'ai',
      logger: {
        debug() {},
      },
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(metrics.loaderMode).toBe('runtime_fetch_eval');
    expect(metrics.scriptCount).toBeGreaterThan(0);
    expect(metrics.scriptCount).toBeLessThan(BATTLE_RUNTIME_SCRIPTS.length);
    expect(evalMock).toHaveBeenCalledTimes(metrics.scriptCount);
    expect(evalMock.mock.calls[0][0]).toContain('sourceURL=http://localhost:3000/shared/replay-schema.js');
    expect(typeof window.GPP.ensureBattleFeatureSet).toBe('function');
    expect(typeof window.GPP.preloadDeferredBattleFeatures).toBe('function');

    const callsBeforeUi = evalMock.mock.calls.length;
    await window.GPP.ensureBattleFeatureSet('ui');
    expect(evalMock.mock.calls.length).toBeGreaterThan(callsBeforeUi);
  });
});
