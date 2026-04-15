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
const createHandlers = require('./handlers');
const createMessageRouter = require('../transport/message-router');
const { normalizeIncomingMessage, PROTOCOL_VERSION } = require('../transport/protocol/messages');
const { sendError, ERROR_CODES } = require('../transport/protocol/errors');

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

function startServer() {
  process.on('uncaughtException', (err) => {
    console.error('[Global Error] Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global Error] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const ROOT_DIR = path.resolve(__dirname, '../../..');
  const CLIENT_DIR = path.join(ROOT_DIR, 'src', 'client');
  const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
  const PUBLIC_PORTRAITS_DIR = path.join(PUBLIC_DIR, 'portraits');
  const SHARED_DIR = path.join(ROOT_DIR, 'src', 'core', 'shared');
  const PICTURE_DIR = path.join(ROOT_DIR, 'picture');

  const app = express();
  app.use(compression());
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
      name: packageMeta.name || 'galaxy-power-party',
      version: packageMeta.version || '0.0.0',
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  app.get('/api/debug/room-metrics', (_req, res) => {
    res.json({ ok: true, generatedAt: Date.now(), metrics: collectRoomMetrics(rooms) });
  });

  function broadcastCharacterCatalog() {
    const payload = {
      type: 'characters_updated',
      characters: getCharacterSummary(),
    };
    wss.clients.forEach((client) => send(client, payload));
  }

  const handlers = createHandlers(rooms);
  const messageRouter = createMessageRouter({
    handlers,
    broadcastCharacterCatalog,
  });

  wss.on('connection', (ws) => {
    ws.awaitingPong = false;
    ws.heartbeatMisses = 0;
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

    ws.on('message', (raw) => {
      const normalized = normalizeIncomingMessage(raw.toString());
      if (!normalized.ok) {
        sendError(ws, normalized.errorCode || ERROR_CODES.INVALID_JSON, normalized.errorMessage, {
          meta: normalized.meta,
        });
        return;
      }
      messageRouter.dispatch(ws, normalized.envelope, normalized.legacyMessage);
    });

    ws.on('close', () => {
      handlers.handleSocketClosed(ws);
    });
  });

  server.listen(PORT, HOST, () => {
    const localUrl = `http://${getLocalOpenHost(HOST)}:${PORT}`;
    const lanIp = getLanIPv4();
    console.log('Galaxy Power Party server running');
    console.log(`Bind: ${HOST}:${PORT}`);
    console.log(`Local: ${localUrl}`);
    if (HOST === '0.0.0.0' || HOST === '::' || HOST === '::0') {
      if (lanIp) {
        console.log(`LAN: http://${lanIp}:${PORT}`);
      } else {
        console.log('LAN: IPv4 address not detected');
      }
    }
  });

  return { app, server, wss, rooms, handlers };
}

module.exports = {
  startServer,
};
