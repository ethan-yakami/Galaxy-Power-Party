import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LEGACY_RUNTIME_SCRIPTS, loadLegacyBattleRuntime } from './load-legacy-battle-runtime.js';

describe('loadLegacyBattleRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.GPP;
  });

  it('evaluates the critical battle runtime from the bundle and installs deferred feature loaders', async () => {
    const fetchMock = vi.fn();
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

    const metrics = await loadLegacyBattleRuntime({
      document,
      launchMode: 'ai',
      logger: {
        debug() {},
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(metrics.loaderMode).toBe('bundle_eval');
    expect(metrics.scriptCount).toBeGreaterThan(0);
    expect(metrics.scriptCount).toBeLessThan(LEGACY_RUNTIME_SCRIPTS.length);
    expect(evalMock).toHaveBeenCalledTimes(metrics.scriptCount);
    expect(evalMock.mock.calls[0][0]).toContain('sourceURL=http://localhost:3000/shared/replay-schema.js');
    expect(typeof window.GPP.ensureBattleFeatureSet).toBe('function');
    expect(typeof window.GPP.preloadDeferredBattleFeatures).toBe('function');

    const callsBeforeUi = evalMock.mock.calls.length;
    await window.GPP.ensureBattleFeatureSet('ui');
    expect(evalMock.mock.calls.length).toBeGreaterThan(callsBeforeUi);
  });
});
