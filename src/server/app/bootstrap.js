const express = require('express');
const compression = require('compression');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');
const WebSocket = require('ws');

const { getCharacterSummary, getAuroraDiceSummary } = require('../services/registry');
const { getWeatherCatalogSummary } = require('../services/weather');
const { send, buildPublicRoomSummary } = require('../services/rooms');
const { clearAIActionTimer } = require('../ai');
const { createLogger } = require('../observability/logger');
const createHandlers = require('./handlers');
const createMessageRouter = require('../transport/message-router');
const { normalizeIncomingMessage, PROTOCOL_VERSION } = require('../transport/protocol/messages');
const { sendError, ERROR_CODES } = require('../transport/protocol/errors');
const replaySchema = require('../../core/shared/replay-schema');
const protocolVersioning = require('../../core/shared/protocol/versioning');
const { createPlatform } = require('../platform/create-platform');
const { registerPlatformHttpRoutes, sendJsonError, createAdminAccessGuard } = require('../platform/http');
const { createWindowRateLimiter } = require('../platform/rate-limit');

const packageMeta = require(path.resolve(__dirname, '../../../package.json'));

function collectRoomMetrics(rooms) {
  const snapshot = {
    totalRooms: 0,
    lobbyRooms: 0,
    inGameRooms: 0,
    endedRooms: 0,
    resumeRooms: 0,
    publicRooms: 0,
    offlineSlots: 0,
  };
  for (const room of rooms.values()) {
    if (!room) continue;
    snapshot.totalRooms += 1;
    if (room.status === 'lobby') snapshot.lobbyRooms += 1;
    else if (room.status === 'in_game') snapshot.inGameRooms += 1;
    else if (room.status === 'ended') snapshot.endedRooms += 1;
    if (room.roomMode === 'resume_room') snapshot.resumeRooms += 1;
    if (room.isPublic === true) snapshot.publicRooms += 1;
    if (Array.isArray(room.players)) {
      snapshot.offlineSlots += room.players.filter((player) => player && (player.isOnline === false || !player.ws)).length;
    }
  }
  return snapshot;
}

function getLanIPv4() {
  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      if (!item || item.internal) continue;
      if (item.family === 'IPv4') return item.address;
    }
  }
  return null;
}

function getLocalOpenHost(host) {
  if (host === '0.0.0.0' || host === '::' || host === '::0') return 'localhost';
  if (host === '::1') return 'localhost';
  return host;
}

function getRequestIp(req) {
  if (!req) return 'unknown';
  const forwarded = req.headers && typeof req.headers['x-forwarded-for'] === 'string'
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : '';
  if (forwarded) return forwarded;
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return 'unknown';
}

function safeNow() {
  return Date.now();
}

function startServer(options = {}) {
  const logger = createLogger('server.bootstrap');
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', {
      message: err && err.message ? err.message : String(err),
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('unhandled_rejection', {
      promise: String(promise),
      reason: reason && reason.message ? reason.message : String(reason),
    });
  });

  const envPort = process.env.PORT;
  const parsedEnvPort = envPort === undefined ? NaN : Number(envPort);
  const PORT = Number.isInteger(options.port)
    ? options.port
    : (Number.isInteger(parsedEnvPort) ? parsedEnvPort : 3000);
  const HOST = options.host || process.env.HOST || '0.0.0.0';
  const ROOT_DIR = path.resolve(__dirname, '../../..');
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const CLIENT_DIR = path.join(ROOT_DIR, 'src', 'client');
  const BUILD_CLIENT_DIR = path.join(ROOT_DIR, 'build', 'client');
  const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
  const PUBLIC_PORTRAITS_DIR = path.join(PUBLIC_DIR, 'portraits');
  const SHARED_DIR = path.join(ROOT_DIR, 'src', 'core', 'shared');
  const PICTURE_DIR = path.join(ROOT_DIR, 'picture');
  const isProductionStatic = NODE_ENV === 'production';
  const hasBuiltClient = fs.existsSync(BUILD_CLIENT_DIR);
  const staticClientDir = isProductionStatic && hasBuiltClient ? BUILD_CLIENT_DIR : CLIENT_DIR;

  const app = express();
  app.set('trust proxy', 1);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.requestId = randomBytes(8).toString('hex');
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  const staticOptions = {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
      const normalized = String(filePath || '').replace(/\\/g, '/');
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      if (/(?:^|\/)(?:assets|chunks)\/.+\.[a-z0-9]{8,}\.(?:js|mjs|css)$/i.test(normalized)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (/\.(?:js|mjs|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  };
  if (isProductionStatic && !hasBuiltClient) {
    logger.warn('built_client_missing_fallback', {
      expectedDir: BUILD_CLIENT_DIR,
      fallbackDir: CLIENT_DIR,
    });
  }
  // Production serves built frontend assets. Development falls back to `src/client`.
  app.use(express.static(staticClientDir, staticOptions));
  app.use('/portraits', express.static(PUBLIC_PORTRAITS_DIR, { maxAge: '24h', etag: true }));
  app.use('/shared', express.static(SHARED_DIR, {
    maxAge: '24h',
    etag: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }));
  app.use('/picture', express.static(PICTURE_DIR, {
    maxAge: '24h',
    etag: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }));

  const server = http.createServer(app);
  const wss = new WebSocket.Server({
    server,
    perMessageDeflate: false,
  });

  const HEARTBEAT_INTERVAL = 30000;
  const HEARTBEAT_MAX_MISSES = 3;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (ws.awaitingPong) {
        ws.heartbeatMisses = (ws.heartbeatMisses || 0) + 1;
      } else {
        ws.heartbeatMisses = 0;
      }

      if ((ws.heartbeatMisses || 0) >= HEARTBEAT_MAX_MISSES) {
        ws.terminate();
        return;
      }

      ws.awaitingPong = true;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    });
  }, HEARTBEAT_INTERVAL);
  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    clearInterval(roomCleanupTimer);
    clearInterval(sessionCleanupTimer);
  });

  const rooms = new Map();
  let nextPlayerId = 1;
  const platform = createPlatform({
    rooms,
    logger: createLogger('server.platform'),
    packageMeta,
    protocolVersion: PROTOCOL_VERSION,
    replayVersion: replaySchema.REPLAY_VERSION,
  });
  const isAdminRequest = createAdminAccessGuard(platform);
  const securityConfig = platform.config && platform.config.security ? platform.config.security : {};
  const wsHandshakeLimiter = createWindowRateLimiter({
    windowMs: Number.isInteger(securityConfig.wsHandshakeWindowMs) ? securityConfig.wsHandshakeWindowMs : 60 * 1000,
    max: Number.isInteger(securityConfig.wsHandshakeMax) ? securityConfig.wsHandshakeMax : 30,
    banMs: Number.isInteger(securityConfig.wsHandshakeBanMs) ? securityConfig.wsHandshakeBanMs : 2 * 60 * 1000,
  });
  const wsActionLimiter = createWindowRateLimiter({
    windowMs: Number.isInteger(securityConfig.wsActionWindowMs) ? securityConfig.wsActionWindowMs : 10 * 1000,
    max: Number.isInteger(securityConfig.wsActionMax) ? securityConfig.wsActionMax : 24,
    banMs: Number.isInteger(securityConfig.wsActionBanMs) ? securityConfig.wsActionBanMs : 60 * 1000,
  });
  const rateLimitedWsTypes = new Set([
    'submit_battle_action',
    'create_custom_character',
    'update_custom_character',
    'delete_custom_character',
  ]);

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      platform.metrics.inc('gpp_http_requests_total', {
        method: req.method,
        route: req.path,
        status: String(res.statusCode),
      });
      logger.info('http_request_completed', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get('/api/public-rooms', (_req, res) => {
    const roomsList = [];
    for (const room of rooms.values()) {
      const summary = buildPublicRoomSummary(room);
      if (summary) roomsList.push(summary);
    }
    roomsList.sort((a, b) => {
      const joinableDiff = Number(b.joinable) - Number(a.joinable);
      if (joinableDiff) return joinableDiff;
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
    });
    res.json({ ok: true, generatedAt: Date.now(), rooms: roomsList });
  });

  let catalogSnapshot = null;
  let catalogSnapshotAt = 0;

  function buildCatalogSnapshot() {
    return {
      characters: getCharacterSummary(),
      auroraDice: getAuroraDiceSummary(),
      weatherCatalog: getWeatherCatalogSummary(),
    };
  }

  function getCatalogSnapshot(forceRefresh = false) {
    if (!catalogSnapshot || forceRefresh) {
      catalogSnapshot = buildCatalogSnapshot();
      catalogSnapshotAt = Date.now();
    }
    return catalogSnapshot;
  }

  app.get('/api/version', (_req, res) => {
    res.json({
      ok: true,
      generatedAt: Date.now(),
      app: {
        name: packageMeta.name || 'galaxy-power-party',
        version: platform.versionInfo.appVersion || packageMeta.version || '0.0.0',
      },
      protocol: {
        current: PROTOCOL_VERSION,
        supported: protocolVersioning.SUPPORTED_PROTOCOL_VERSIONS,
        deprecated: protocolVersioning.DEPRECATED_PROTOCOL_VERSIONS,
      },
      replay: {
        current: replaySchema.REPLAY_VERSION,
        supported: replaySchema.SUPPORTED_REPLAY_VERSIONS,
      },
    });
  });

  app.get('/api/catalog', (_req, res) => {
    const catalog = getCatalogSnapshot(false);
    res.json({
      ok: true,
      generatedAt: catalogSnapshotAt || Date.now(),
      characters: catalog.characters,
      auroraDice: catalog.auroraDice,
      weatherCatalog: catalog.weatherCatalog,
    });
  });

  app.get('/api/debug/room-metrics', (_req, res) => {
    if (!isAdminRequest(_req)) {
      const provided = !!(_req.headers && (_req.headers['x-admin-token'] || _req.headers.authorization));
      sendJsonError(
        res,
        provided ? 403 : 401,
        provided ? 'admin_forbidden' : 'admin_auth_required',
        'Admin token required.',
      );
      return;
    }
    res.json({ ok: true, generatedAt: Date.now(), metrics: collectRoomMetrics(rooms) });
  });
  registerPlatformHttpRoutes(app, {
    platform,
    logger,
  });

  function broadcastCharacterCatalog() {
    const catalog = getCatalogSnapshot(true);
    const payload = {
      type: 'characters_updated',
      characters: catalog.characters,
    };
    wss.clients.forEach((client) => send(client, payload));
  }

  const handlers = createHandlers(rooms, { platform });
  const messageRouter = createMessageRouter({
    handlers,
    broadcastCharacterCatalog,
  });

  const roomCleanupIntervalMs = Number.isInteger(securityConfig.roomCleanupIntervalMs)
    ? securityConfig.roomCleanupIntervalMs
    : 30 * 1000;
  const roomIdleTtlMs = Number.isInteger(securityConfig.roomIdleTtlMs)
    ? securityConfig.roomIdleTtlMs
    : 30 * 60 * 1000;
  const playerOfflineGraceMs = Number.isInteger(securityConfig.playerOfflineGraceMs)
    ? securityConfig.playerOfflineGraceMs
    : 2 * 60 * 1000;
  const sessionCleanupIntervalMs = Number.isInteger(securityConfig.sessionCleanupIntervalMs)
    ? securityConfig.sessionCleanupIntervalMs
    : 10 * 60 * 1000;

  const roomCleanupTimer = setInterval(() => {
    const now = safeNow();
    let removedRooms = 0;
    let removedPlayers = 0;
    const removalDetails = [];
    for (const [roomCode, room] of rooms.entries()) {
      if (!room || !Array.isArray(room.players)) {
        rooms.delete(roomCode);
        removedRooms += 1;
        removalDetails.push({ roomCode, reason: 'invalid_room_record' });
        continue;
      }

      room.players = room.players.filter((player) => {
        if (!player) return false;
        if (player.ws && player.ws.isAI) return true;
        if (player.isOnline !== false && player.ws) return true;
        const disconnectedAt = Number.isFinite(player.disconnectedAt) ? player.disconnectedAt : 0;
        if (!disconnectedAt) return true;
        if ((now - disconnectedAt) <= playerOfflineGraceMs) return true;
        removedPlayers += 1;
        removalDetails.push({
          roomCode,
          reason: 'offline_player_expired',
          playerId: player.id || null,
        });
        return false;
      });

      const hasHumanOnline = room.players.some((player) => player && !(player.ws && player.ws.isAI) && player.ws && player.isOnline !== false);
      const onlyAiOrEmpty = room.players.length === 0
        || room.players.every((player) => player && player.ws && player.ws.isAI);
      const lastActiveAt = Number.isFinite(room.lastActiveAt) ? room.lastActiveAt : 0;
      const idleExpired = lastActiveAt > 0 && (now - lastActiveAt) > roomIdleTtlMs;
      if (onlyAiOrEmpty || (idleExpired && !hasHumanOnline)) {
        clearAIActionTimer(room);
        rooms.delete(roomCode);
        removedRooms += 1;
        removalDetails.push({
          roomCode,
          reason: onlyAiOrEmpty ? 'room_empty_or_ai_only' : 'room_idle_expired',
          status: room.status || 'unknown',
        });
      }
    }

    wsHandshakeLimiter.prune(now);
    wsActionLimiter.prune(now);
    if (removedRooms > 0 || removedPlayers > 0) {
      logger.info('room_cleanup_applied', {
        removedRooms,
        removedPlayers,
        activeRooms: rooms.size,
        removalDetails: removalDetails.slice(0, 20),
      });
    }
  }, roomCleanupIntervalMs);

  const sessionCleanupTimer = setInterval(async () => {
    try {
      const removed = await platform.cleanupExpiredSessions();
      if (removed > 0) {
        logger.info('session_cleanup_applied', { removed });
      }
    } catch (error) {
      logger.warn('session_cleanup_failed', {
        message: error && error.message ? error.message : String(error),
      });
    }
  }, sessionCleanupIntervalMs);
  server.on('close', () => {
    clearInterval(roomCleanupTimer);
    clearInterval(sessionCleanupTimer);
  });

  wss.on('connection', async (ws, req) => {
    const requestIp = getRequestIp(req);
    ws.awaitingPong = false;
    ws.heartbeatMisses = 0;
    ws.requestIp = requestIp;
    platform.metrics.inc('gpp_socket_connections_total');
    ws.authUser = null;
    ws.authSessionId = null;
    logger.info('socket_connected', {
      playerId: ws.playerId || null,
      userId: ws.authUser ? ws.authUser.id : null,
    });
    ws.on('pong', () => {
      ws.awaitingPong = false;
      ws.heartbeatMisses = 0;
    });

    ws.reconnectToken = randomBytes(24).toString('hex');
    ws.playerRoomCode = null;
    ws.playerId = `P${nextPlayerId++}_${ws.reconnectToken.slice(0, 8)}`;

    const catalog = getCatalogSnapshot(false);
    send(ws, {
      type: 'welcome',
      playerId: ws.playerId,
      reconnectToken: ws.reconnectToken,
      characters: catalog.characters,
      auroraDice: catalog.auroraDice,
      weatherCatalog: catalog.weatherCatalog,
      meta: {
        protocolVersion: PROTOCOL_VERSION,
      },
    });
    logger.info('welcome_sent', {
      playerId: ws.playerId,
      protocolVersion: PROTOCOL_VERSION,
    });

    ws.on('message', (raw) => {
      const normalized = normalizeIncomingMessage(raw.toString());
      if (!normalized.ok) {
        platform.metrics.inc('gpp_protocol_rejected_total', {
          code: normalized.errorCode || ERROR_CODES.INVALID_JSON,
        });
        logger.warn('socket_message_rejected', {
          playerId: ws.playerId,
          errorCode: normalized.errorCode || ERROR_CODES.INVALID_JSON,
          errorMessage: normalized.errorMessage,
        });
        sendError(ws, normalized.errorCode || ERROR_CODES.INVALID_JSON, normalized.errorMessage, {
          meta: normalized.meta,
        });
        return;
      }
      if (rateLimitedWsTypes.has(normalized.envelope.type)) {
        const rateKey = `${ws.requestIp || 'unknown'}:${normalized.envelope.type}`;
        const actionRate = wsActionLimiter.consume(rateKey);
        if (!actionRate.ok) {
          platform.metrics.inc('gpp_rate_limited_total', {
            scope: 'ws_action',
            type: normalized.envelope.type,
          });
          logger.warn('socket_message_rate_limited', {
            playerId: ws.playerId,
            type: normalized.envelope.type,
            requestIp: ws.requestIp || 'unknown',
          });
          sendError(ws, ERROR_CODES.RATE_LIMITED, 'Too many requests, please retry later.', {
            meta: normalized.meta,
          });
          return;
        }
      }
      logger.debug('socket_message_accepted', {
        playerId: ws.playerId,
        type: normalized.envelope.type,
        requestId: normalized.envelope.meta && normalized.envelope.meta.requestId,
      });
      messageRouter.dispatch(ws, normalized.envelope, normalized.legacyMessage);
    });

    ws.on('close', () => {
      logger.info('socket_closed', {
        playerId: ws.playerId,
        roomCode: ws.playerRoomCode,
        userId: ws.authUser ? ws.authUser.id : null,
      });
      handlers.handleSocketClosed(ws);
    });
  });

  server.listen(PORT, HOST, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : PORT;
    const localUrl = `http://${getLocalOpenHost(HOST)}:${actualPort}`;
    const lanIp = getLanIPv4();
    const catalog = getCatalogSnapshot(false);
    const characterCount = catalog.characters.length;
    const auroraCount = catalog.auroraDice.length;
    logger.info('server_started', {
      bind: `${HOST}:${actualPort}`,
      localUrl,
      nodeEnv: platform.config.nodeEnv,
      storeProvider: platform.config.database.provider,
      characterCount,
      auroraCount,
    });
    if (auroraCount === 0) {
      logger.error('aurora_catalog_empty', {
        hint: 'Aurora registry is empty. Check content entities directory names and deployment artifact completeness.',
      });
    }
    if (HOST === '0.0.0.0' || HOST === '::' || HOST === '::0') {
      if (lanIp) {
        logger.info('lan_url_detected', {
          lanUrl: `http://${lanIp}:${actualPort}`,
        });
      } else {
        logger.warn('lan_ip_not_detected');
      }
    }
  });

  return { app, server, wss, rooms, handlers, platform };
}

module.exports = {
  startServer,
};
