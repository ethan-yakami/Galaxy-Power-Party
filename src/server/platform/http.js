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
  app.use((req, _res, next) => {
    req.platform = platform;
    next();
  });
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

  app.get('/api/metrics', (_req, res) => {
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

  app.get('/api/debug/rooms', async (_req, res) => {
    const snapshot = await platform.buildRoomDiagnostics();
    res.json({
      ok: true,
      ...snapshot,
      generatedAt: Date.now(),
    });
  });

  app.get('/api/debug/rooms/:roomCode', async (req, res) => {
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
};
