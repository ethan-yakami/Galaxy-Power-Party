function normalizeOrigin(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

/**
 * @param {any} windowRef
 */
export function installRuntimeConfig(windowRef) {
  const endpoints = Object.assign({}, windowRef.__GPP_ENDPOINTS__ || {});
  const metaEnv = import.meta && import.meta.env && typeof import.meta.env === 'object'
    ? import.meta.env
    : {};
  const apiOrigin = normalizeOrigin(metaEnv.VITE_GPP_API_ORIGIN);
  const wsOrigin = normalizeOrigin(metaEnv.VITE_GPP_WS_ORIGIN);

  if (apiOrigin) endpoints.apiOrigin = apiOrigin;
  if (wsOrigin) endpoints.wsOrigin = wsOrigin;

  windowRef.__GPP_ENDPOINTS__ = Object.freeze(endpoints);
  windowRef.__GPP_APP__ = windowRef.__GPP_APP__ && typeof windowRef.__GPP_APP__ === 'object'
    ? windowRef.__GPP_APP__
    : {};

  return windowRef.__GPP_ENDPOINTS__;
}
