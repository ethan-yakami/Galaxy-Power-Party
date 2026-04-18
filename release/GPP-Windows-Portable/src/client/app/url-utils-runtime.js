function getLocation(windowRef, locationRef) {
  if (locationRef) return locationRef;
  if (windowRef && windowRef.location) return windowRef.location;
  return {
    origin: 'http://localhost',
    pathname: '/',
    protocol: 'http:',
    host: 'localhost',
  };
}

function stripLeadingSlash(value) {
  return String(value || '').replace(/^\/+/, '');
}

function getConfiguredEndpoints(windowRef) {
  if (!windowRef || !windowRef.__GPP_ENDPOINTS__ || typeof windowRef.__GPP_ENDPOINTS__ !== 'object') {
    return {};
  }
  return windowRef.__GPP_ENDPOINTS__;
}

function withTrailingSlash(url) {
  const value = String(url || '');
  return value.endsWith('/') ? value : `${value}/`;
}

function getOrigin(windowRef, locationRef) {
  const target = getLocation(windowRef, locationRef);
  if (target.origin) return target.origin;
  const protocol = target.protocol || 'http:';
  const host = target.host || 'localhost';
  return `${protocol}//${host}`;
}

function getBasePath(windowRef, locationRef) {
  const target = getLocation(windowRef, locationRef);
  const pathname = typeof target.pathname === 'string' && target.pathname
    ? target.pathname
    : '/';
  const slashIndex = pathname.lastIndexOf('/');
  if (slashIndex < 0) return '/';
  return pathname.slice(0, slashIndex + 1) || '/';
}

function resolveFromBase(windowRef, targetPath, locationRef) {
  const location = getLocation(windowRef, locationRef);
  const origin = getOrigin(windowRef, location);
  const basePath = getBasePath(windowRef, location);
  const baseUrl = new URL(basePath, origin);
  return new URL(stripLeadingSlash(targetPath), baseUrl);
}

export function createUrlUtils(windowRef) {
  return Object.freeze({
    getBasePath(locationRef) {
      return getBasePath(windowRef, locationRef);
    },
    toPath(targetPath, locationRef) {
      if (!targetPath) return getBasePath(windowRef, locationRef);
      const url = resolveFromBase(windowRef, targetPath, locationRef);
      return `${url.pathname}${url.search}${url.hash}`;
    },
    toApi(targetPath, locationRef) {
      const configured = getConfiguredEndpoints(windowRef);
      if (configured.apiOrigin) {
        const target = new URL(`api/${stripLeadingSlash(targetPath)}`, withTrailingSlash(configured.apiOrigin));
        return target.toString();
      }
      return this.toPath(`api/${stripLeadingSlash(targetPath)}`, locationRef);
    },
    toAsset(targetPath, locationRef) {
      return this.toPath(stripLeadingSlash(targetPath), locationRef);
    },
    toWsUrl(locationRef, wsProtocol) {
      const configured = getConfiguredEndpoints(windowRef);
      if (configured.wsOrigin) {
        const target = new URL(configured.wsOrigin);
        target.protocol = wsProtocol || (target.protocol === 'https:' ? 'wss:' : 'ws:');
        return target.toString();
      }
      const location = getLocation(windowRef, locationRef);
      const url = new URL(getBasePath(windowRef, location), getOrigin(windowRef, location));
      url.protocol = wsProtocol || (location.protocol === 'https:' ? 'wss:' : 'ws:');
      return url.toString();
    },
  });
}

export function installUrlUtils(windowRef) {
  const urls = createUrlUtils(windowRef);
  windowRef.GPPUrls = urls;
  return urls;
}
