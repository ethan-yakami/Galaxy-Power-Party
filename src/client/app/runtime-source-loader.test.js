import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRuntimeSourceCache, loadRuntimeSources, resolveRuntimeSourceUrl } from './runtime-source-loader.js';

describe('runtime-source-loader', () => {
  beforeEach(() => {
    clearRuntimeSourceCache();
    Object.defineProperty(document, 'baseURI', {
      configurable: true,
      value: 'http://localhost:3000/battle.html',
    });
  });

  it('resolves runtime source urls relative to the current document', () => {
    expect(resolveRuntimeSourceUrl(document, 'js/url-utils.js')).toBe('http://localhost:3000/js/url-utils.js');
    expect(resolveRuntimeSourceUrl(document, 'shared/protocol/error-registry.js')).toBe('http://localhost:3000/shared/protocol/error-registry.js');
  });

  it('caches runtime source requests across repeated loads', async () => {
    const fetchMock = vi.fn(async (input) => ({
      ok: true,
      status: 200,
      async text() {
        return `// ${String(input)}`;
      },
    }));

    const firstLoad = await loadRuntimeSources({
      documentRef: document,
      sources: ['js/url-utils.js', 'js/url-utils.js'],
      fetchImpl: fetchMock,
    });
    const secondLoad = await loadRuntimeSources({
      documentRef: document,
      sources: ['js/url-utils.js'],
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstLoad.sources).toHaveLength(2);
    expect(secondLoad.sources).toHaveLength(1);
    expect(firstLoad.sources[0].code).toContain('url-utils.js');
    expect(secondLoad.sources[0].code).toContain('url-utils.js');
  });
});
