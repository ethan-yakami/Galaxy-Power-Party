import { evalLegacySource } from './eval-legacy-source.js';

const runtimeSourceCache = new Map();

function getFetchImpl(documentRef, fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  const windowRef = documentRef && documentRef.defaultView ? documentRef.defaultView : globalThis;
  if (windowRef && typeof windowRef.fetch === 'function') {
    return windowRef.fetch.bind(windowRef);
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('Fetch is unavailable, so runtime sources cannot be loaded.');
}

export function resolveRuntimeSourceUrl(documentRef, src) {
  return new URL(String(src || ''), documentRef.baseURI).toString();
}

export function clearRuntimeSourceCache() {
  runtimeSourceCache.clear();
}

export async function fetchRuntimeSource(options) {
  const { documentRef, src, fetchImpl } = options;
  const url = resolveRuntimeSourceUrl(documentRef, src);
  if (!runtimeSourceCache.has(url)) {
    const request = Promise.resolve().then(async () => {
      const response = await getFetchImpl(documentRef, fetchImpl)(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response || !response.ok) {
        const status = response ? response.status : 'unknown';
        throw new Error(`Failed to load runtime source: ${src} (HTTP ${status})`);
      }
      const code = await response.text();
      return {
        src,
        url,
        code,
      };
    }).catch((error) => {
      runtimeSourceCache.delete(url);
      throw error;
    });
    runtimeSourceCache.set(url, request);
  }
  return runtimeSourceCache.get(url);
}

export async function loadRuntimeSources(options) {
  const { documentRef, sources, fetchImpl } = options;
  const fetchStartedAt = Date.now();
  const loaded = await Promise.all(
    (Array.isArray(sources) ? sources : []).map((src) => fetchRuntimeSource({
      documentRef,
      src,
      fetchImpl,
    }))
  );
  return {
    sources: loaded,
    fetchStartedAt,
    fetchCompletedAt: Date.now(),
  };
}

export function evaluateRuntimeSources(windowRef, sources) {
  for (const source of Array.isArray(sources) ? sources : []) {
    evalLegacySource(windowRef, source.url, source.code);
  }
}
