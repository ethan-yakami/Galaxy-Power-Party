const express = require('express');
const compression = require('compression');
const http = require('http');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');
const WebSocket = require('ws');

const { getCharacterSummary, getAuroraDiceSummary } = require('../services/registry');
const { getWeatherCatalogSummary } = require('../services/weather');
const { send, buildPublicRoomSummary } = require('../services/rooms');
const { createLogger } = require('../observability/logger');
const createHandlers = require('./handlers');
const createMessageRouter = require('../transport/message-router');
const { normalizeIncomingMessage, PROTOCOL_VERSION } = require('../transport/protocol/messages');
const { sendError, ERROR_CODES } = require('../transport/protocol/errors');
const replaySchema = require('../../core/shared/replay-schema');
const protocolVersioning = require('../../core/shared/protocol/versioning');
const { createPlatform } = require('../platform/create-platform');
const { registerPlatformHttpRoutes } = require('../platform/http');

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
  const CLIENT_DIR = path.join(ROOT_DIR, 'src', 'client');
  const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
  const PUBLIC_PORTRAITS_DIR = path.join(PUBLIC_DIR, 'portraits');
  const SHARED_DIR = path.join(ROOT_DIR, 'src', 'core', 'shared');
  const PICTURE_DIR = path.join(ROOT_DIR, 'picture');

  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.requestId = randomBytes(8).toString('hex');
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  const staticOptions = {
    maxAge: '1h',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  };
  // Frontend runtime source is `src/client`. The legacy `public` tree is kept
  // only for asset folders that have not moved yet.
  app.use(express.static(CLIENT_DIR, staticOptions));
  app.use('/portraits', express.static(PUBLIC_PORTRAITS_DIR, { maxAge: '1h', etag: true }));
  app.use('/shared', express.static(SHARED_DIR, { maxAge: '1h', etag: true }));
  app.use('/picture', express.static(PICTURE_DIR));

  const server = http.createServer(app);
  const wss = new WebSocket.Server({
    server,
    perMessageDeflate: {
      zlibDeflateOptions: { level: 1 },
      threshold: 128,
    },
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
  wss.on('close', () => clearInterval(heartbeatTimer));

  const rooms = new Map();
  let nextPlayerId = 1;
  const platform = createPlatform({
    rooms,
    logger: createLogger('server.platform'),
    packageMeta,
    protocolVersion: PROTOCOL_VERSION,
    replayVersion: replaySchema.REPLAY_VERSION,
  });

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

  app.get('/api/version', (_req, res) => {
    res.json({
      ok: true,
      generatedAt: Date.now(),
      app: {
        name: packageMeta.name || 'galaxy-power-party',
        version: packageMeta.version || '0.0.0',
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

  app.get('/api/debug/room-metrics', (_req, res) => {
    res.json({ ok: true, generatedAt: Date.now(), metrics: collectRoomMetrics(rooms) });
  });
  registerPlatformHttpRoutes(app, {
    platform,
    logger,
  });

  function broadcastCharacterCatalog() {
    const payload = {
      type: 'characters_updated',
      characters: getCharacterSummary(),
    };
    wss.clients.forEach((client) => send(client, payload));
  }

  const handlers = createHandlers(rooms, { platform });
  const messageRouter = createMessageRouter({
    handlers,
    broadcastCharacterCatalog,
  });

  wss.on('connection', async (ws, req) => {
    ws.awaitingPong = false;
    ws.heartbeatMisses = 0;
    platform.metrics.inc('gpp_socket_connections_total');
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const accessToken = requestUrl.searchParams.get('accessToken')
        || requestUrl.searchParams.get('token')
        || '';
      if (accessToken) {
        const auth = await platform.authenticateAccessToken(accessToken);
        if (auth.ok) {
          ws.authUser = auth.profile;
          ws.authSessionId = auth.session.id;
        } else {
          platform.metrics.inc('gpp_auth_failures_total', { reason: auth.reason || 'ws_auth_failed' });
        }
      }
    } catch {
      // Ignore query parsing/auth errors for anonymous ws sessions.
    }
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

    send(ws, {
      type: 'welcome',
      playerId: ws.playerId,
      reconnectToken: ws.reconnectToken,
      characters: getCharacterSummary(),
      auroraDice: getAuroraDiceSummary(),
      weatherCatalog: getWeatherCatalogSummary(),
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
    logger.info('server_started', {
      bind: `${HOST}:${actualPort}`,
      localUrl,
    });
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
