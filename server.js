const express = require('express');
const compression = require('compression');
const http = require('http');
const path = require('path');
const os = require('os');
const { randomBytes } = require('crypto');
const WebSocket = require('ws');

const { getCharacterSummary, getAuroraDiceSummary } = require('./server/registry');
const { send } = require('./server/rooms');
const createHandlers = require('./server/handlers');

process.on('uncaughtException', (err) => {
  console.error('[Global Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Global Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 1 },
    threshold: 128,
  },
});

// WebSocket heartbeat with tolerant miss threshold for weak networks
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

const handlers = createHandlers(rooms);

function broadcastCharacterCatalog() {
  const payload = {
    type: 'characters_updated',
    characters: getCharacterSummary(),
  };
  wss.clients.forEach((client) => send(client, payload));
}

wss.on('connection', (ws) => {
  ws.awaitingPong = false;
  ws.heartbeatMisses = 0;
  ws.on('pong', () => {
    ws.awaitingPong = false;
    ws.heartbeatMisses = 0;
  });

  ws.playerId = `P${nextPlayerId++}`;
  ws.playerRoomCode = null;
  ws.reconnectToken = randomBytes(24).toString('hex');

  send(ws, {
    type: 'welcome',
    playerId: ws.playerId,
    reconnectToken: ws.reconnectToken,
    characters: getCharacterSummary(),
    auroraDice: getAuroraDiceSummary(),
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: '消息格式错误。' });
    }

    switch (msg.type) {
      case 'create_room':
        try {
          handlers.handleCreateRoom(ws, msg);
        } catch (err) {
          console.error('[Error] handleCreateRoom:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'create_ai_room':
        try {
          handlers.handleCreateAIRoom(ws, msg);
        } catch (err) {
          console.error('[Error] handleCreateAIRoom:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'join_room':
        try {
          handlers.handleJoinRoom(ws, msg);
        } catch (err) {
          console.error('[Error] handleJoinRoom:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'choose_character':
        try {
          handlers.handleChooseCharacter(ws, msg);
        } catch (err) {
          console.error('[Error] handleChooseCharacter:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'choose_aurora_die':
        try {
          handlers.handleChooseAurora(ws, msg);
        } catch (err) {
          console.error('[Error] handleChooseAurora:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'create_custom_character':
        try {
          const created = handlers.handleCreateCustomCharacter(ws, msg);
          if (created) {
            broadcastCharacterCatalog();
          }
        } catch (err) {
          console.error('[Error] handleCreateCustomCharacter:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'leave_room':
        try {
          handlers.leaveRoom(ws, { reason: 'leave_room' });
          send(ws, { type: 'left_room' });
        } catch (err) {
          console.error('[Error] leaveRoom:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'resume_session':
        try {
          handlers.handleResumeSession(ws, msg);
        } catch (err) {
          console.error('[Error] handleResumeSession:', err);
          send(ws, { type: 'session_resume_failed', reason: 'server_error' });
        }
        break;
      case 'play_again':
        try {
          handlers.handlePlayAgain(ws);
        } catch (err) {
          console.error('[Error] handlePlayAgain:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'disband_room':
        try {
          handlers.handleDisbandRoom(ws);
        } catch (err) {
          console.error('[Error] handleDisbandRoom:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'roll_attack':
        try {
          handlers.handleRollAttack(ws);
        } catch (err) {
          console.error('[Error] handleRollAttack:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'use_aurora_die':
        try {
          handlers.handleUseAurora(ws);
        } catch (err) {
          console.error('[Error] handleUseAurora:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'reroll_attack':
        try {
          handlers.handleRerollAttack(ws, msg);
        } catch (err) {
          console.error('[Error] handleRerollAttack:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'update_live_selection':
        try {
          handlers.handleUpdateLiveSelection(ws, msg);
        } catch (err) {
          console.error('[Error] handleUpdateLiveSelection:', err);
        }
        break;
      case 'confirm_attack_selection':
        try {
          handlers.handleConfirmAttack(ws, msg);
        } catch (err) {
          console.error('[Error] handleConfirmAttack:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'roll_defense':
        try {
          handlers.handleRollDefense(ws);
        } catch (err) {
          console.error('[Error] handleRollDefense:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      case 'confirm_defense_selection':
        try {
          handlers.handleConfirmDefense(ws, msg);
        } catch (err) {
          console.error('[Error] handleConfirmDefense:', err);
          send(ws, { type: 'error', message: '服务器发生内部错误。' });
        }
        break;
      default:
        send(ws, { type: 'error', message: '未知消息类型。' });
    }
  });

  ws.on('close', () => {
    handlers.handleSocketClosed(ws);
  });
});

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

server.listen(PORT, HOST, () => {
  const localUrl = `http://${getLocalOpenHost(HOST)}:${PORT}`;
  const lanIp = getLanIPv4();

  // eslint-disable-next-line no-console
  console.log(`Galaxy Power Party server running`);
  // eslint-disable-next-line no-console
  console.log(`Bind: ${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Local: ${localUrl}`);
  if (HOST === '0.0.0.0' || HOST === '::' || HOST === '::0') {
    if (lanIp) {
      // eslint-disable-next-line no-console
      console.log(`LAN: http://${lanIp}:${PORT}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('LAN: IPv4 address not detected');
    }
  }
});



