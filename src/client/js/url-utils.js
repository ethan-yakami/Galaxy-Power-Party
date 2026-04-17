(function initUrlUtils(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }
  root.GPPUrls = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildUrlUtils(root) {
  function getLocation(locationRef) {
    if (locationRef) return locationRef;
    if (root && root.location) return root.location;
    return {
      origin: 'http://localhost',
      pathname: '/',
      protocol: 'http:',
      host: 'localhost',
    };
  }

  function stripLeadingSlash(path) {
    return String(path || '').replace(/^\/+/, '');
  }

  function getConfiguredEndpoints() {
    if (!root || !root.__GPP_ENDPOINTS__ || typeof root.__GPP_ENDPOINTS__ !== 'object') {
      return {};
    }
    return root.__GPP_ENDPOINTS__;
  }

  function withTrailingSlash(url) {
    const value = String(url || '');
    return value.endsWith('/') ? value : `${value}/`;
  }

  function getOrigin(locationRef) {
    const target = getLocation(locationRef);
    if (target.origin) return target.origin;
    const protocol = target.protocol || 'http:';
    const host = target.host || 'localhost';
    return `${protocol}//${host}`;
  }

  function getBasePath(locationRef) {
    const target = getLocation(locationRef);
    const pathname = typeof target.pathname === 'string' && target.pathname
      ? target.pathname
      : '/';
    const slashIndex = pathname.lastIndexOf('/');
    if (slashIndex < 0) return '/';
    return pathname.slice(0, slashIndex + 1) || '/';
  }

  function resolveFromBase(path, locationRef) {
    const target = getLocation(locationRef);
    const origin = getOrigin(target);
    const basePath = getBasePath(target);
    const baseUrl = new URL(basePath, origin);
    return new URL(stripLeadingSlash(path), baseUrl);
  }

  function toPath(path, locationRef) {
    if (!path) return getBasePath(locationRef);
    const url = resolveFromBase(path, locationRef);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function toApi(path, locationRef) {
    const configured = getConfiguredEndpoints();
    if (configured.apiOrigin) {
      const target = new URL(`api/${stripLeadingSlash(path)}`, withTrailingSlash(configured.apiOrigin));
      return target.toString();
    }
    return toPath(`api/${stripLeadingSlash(path)}`, locationRef);
  }

  function toAsset(path, locationRef) {
    return toPath(stripLeadingSlash(path), locationRef);
  }

  function toWsUrl(locationRef, wsProtocol) {
    const configured = getConfiguredEndpoints();
    if (configured.wsOrigin) {
      const target = new URL(configured.wsOrigin);
      target.protocol = wsProtocol || (target.protocol === 'https:' ? 'wss:' : 'ws:');
      return target.toString();
    }
    const target = getLocation(locationRef);
    const url = new URL(getBasePath(target), getOrigin(target));
    url.protocol = wsProtocol || (target.protocol === 'https:' ? 'wss:' : 'ws:');
    return url.toString();
  }

  return Object.freeze({
    getBasePath,
    toPath,
    toApi,
    toAsset,
    toWsUrl,
  });
});
