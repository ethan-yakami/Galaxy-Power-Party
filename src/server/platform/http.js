const { createWindowRateLimiter } = require('./rate-limit');

function sendJsonError(res, status, code, message, extra = {}) {
  res.status(status).json({
    ok: false,
    code,
    message,
    ...extra,
  });
}

function getBearerToken(req) {
  const header = req && req.headers ? req.headers.authorization : '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return '';
}

function getAdminToken(req) {
  const headerToken = req && req.headers && typeof req.headers['x-admin-token'] === 'string'
    ? req.headers['x-admin-token'].trim()
    : '';
  if (headerToken) return headerToken;
  return getBearerToken(req);
}

function createAdminAccessGuard(platform) {
  const expectedToken = platform && platform.config && platform.config.admin
    ? String(platform.config.admin.token || '').trim()
    : '';
  return function isAdminRequest(req) {
    if (!expectedToken) return false;
    const provided = getAdminToken(req);
    return !!provided && provided === expectedToken;
  };
}

function createRequireAdminMiddleware(platform) {
  const isAdminRequest = createAdminAccessGuard(platform);
  return function requireAdmin(req, res, next) {
    if (isAdminRequest(req)) {
      next();
      return;
    }
    const provided = !!getAdminToken(req);
    sendJsonError(
      res,
      provided ? 403 : 401,
      provided ? 'admin_forbidden' : 'admin_auth_required',
      'Admin token required.',
    );
  };
}

function createAuthRateLimitMiddleware(platform) {
  const security = platform && platform.config ? platform.config.security : {};
  const limiter = createWindowRateLimiter({
    windowMs: security && Number.isInteger(security.authRateLimitWindowMs) ? security.authRateLimitWindowMs : 60 * 1000,
    max: security && Number.isInteger(security.authRateLimitMax) ? security.authRateLimitMax : 20,
    banMs: security && Number.isInteger(security.authRateLimitBanMs) ? security.authRateLimitBanMs : 5 * 60 * 1000,
  });
  return function authRateLimit(req, res, next) {
    if (!req.path || !['/register', '/login', '/refresh'].includes(req.path)) {
      next();
      return;
    }
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const limited = limiter.consume(key);
    if (limited.ok) {
      next();
      return;
    }
    if (platform && platform.metrics && typeof platform.metrics.inc === 'function') {
      platform.metrics.inc('gpp_rate_limited_total', {
        scope: 'http_auth',
        path: req.path,
      });
    }
    sendJsonError(res, 429, 'rate_limited', 'Too many requests, please retry later.', {
      retryAfterMs: limited.retryAfterMs,
    });
  };
}

async function attachAuthUser(req, _res, next) {
  const token = getBearerToken(req);
  if (!token || !req.platform) {
    req.auth = null;
    next();
    return;
  }
  const auth = await req.platform.authenticateAccessToken(token);
  req.auth = auth.ok ? auth : null;
  next();
}

function registerPlatformHttpRoutes(app, { platform, logger }) {
  const requireAdmin = createRequireAdminMiddleware(platform);
  const authRateLimit = createAuthRateLimitMiddleware(platform);
  app.use((req, _res, next) => {
    req.platform = platform;
    next();
  });
  app.use('/api/auth', authRateLimit);
  app.use(attachAuthUser);

  app.get('/api/healthz', async (_req, res) => {
    const health = await platform.store.health();
    res.json({
      ok: true,
      service: 'galaxy-power-party',
      store: health,
      generatedAt: Date.now(),
    });
  });

  app.get('/api/readyz', async (_req, res) => {
    const ready = await platform.store.ready();
    res.status(ready.ok ? 200 : 503).json({
      ok: ready.ok === true,
      store: ready,
      generatedAt: Date.now(),
    });
  });

  app.get('/api/metrics', requireAdmin, (_req, res) => {
    res.type('text/plain').send(platform.metrics.renderPrometheus());
  });

  app.post('/api/auth/register', async (req, res) => {
    const result = await platform.registerAccount({
      username: req.body && req.body.username,
      password: req.body && req.body.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (!result.ok) {
      sendJsonError(res, 400, result.reason, 'Register failed.');
      return;
    }
    res.status(201).json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const result = await platform.loginAccount({
      username: req.body && req.body.username,
      password: req.body && req.body.password,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (!result.ok) {
      sendJsonError(res, 401, result.reason, 'Login failed.');
      return;
    }
    res.json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  });

  app.post('/api/auth/refresh', async (req, res) => {
    const result = await platform.refreshSession({
      refreshToken: req.body && req.body.refreshToken,
    });
    if (!result.ok) {
      sendJsonError(res, 401, result.reason, 'Refresh failed.');
      return;
    }
    res.json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
    });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const result = await platform.logout({
      refreshToken: req.body && req.body.refreshToken,
      accessToken: getBearerToken(req),
    });
    if (!result.ok) {
      sendJsonError(res, 400, result.reason, 'Logout failed.');
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    if (!req.auth) {
      sendJsonError(res, 401, 'auth_required', 'Authentication required.');
      return;
    }
    res.json({
      ok: true,
      user: req.auth.profile,
    });
  });

  app.get('/api/replays', async (req, res) => {
    if (!req.auth) {
      sendJsonError(res, 401, 'auth_required', 'Authentication required.');
      return;
    }
    const items = await platform.listUserReplays(req.auth.user.id);
    res.json({
      ok: true,
      items,
    });
  });

  app.get('/api/replays/:replayId', async (req, res) => {
    if (!req.auth) {
      sendJsonError(res, 401, 'auth_required', 'Authentication required.');
      return;
    }
    const item = await platform.getUserReplay(req.auth.user.id, req.params.replayId);
    if (!item || !item.replay) {
      sendJsonError(res, 404, 'replay_not_found', 'Replay not found.');
      return;
    }
    res.json({
      ok: true,
      replay: item.replay,
      meta: {
        replayId: item.replayId,
        createdAt: item.createdAt,
        sourceRoomMode: item.sourceRoomMode,
        roomCode: item.roomCode,
      },
    });
  });

  app.get('/api/debug/rooms', requireAdmin, async (_req, res) => {
    const snapshot = await platform.buildRoomDiagnostics();
    res.json({
      ok: true,
      ...snapshot,
      generatedAt: Date.now(),
    });
  });

  app.get('/api/debug/rooms/:roomCode', requireAdmin, async (req, res) => {
    const snapshot = await platform.buildRoomDiagnostics(req.params.roomCode);
    res.status(snapshot.ok ? 200 : 404).json({
      ...snapshot,
      generatedAt: Date.now(),
    });
  });

  app.use((err, req, res, next) => {
    if (!err) {
      next();
      return;
    }
    logger.error('http_route_error', {
      requestId: req.requestId || null,
      path: req.path,
      method: req.method,
      message: err.message,
    });
    sendJsonError(res, 500, 'internal_error', 'Internal server error.');
  });
}

module.exports = {
  registerPlatformHttpRoutes,
  getBearerToken,
  sendJsonError,
  createAdminAccessGuard,
};
