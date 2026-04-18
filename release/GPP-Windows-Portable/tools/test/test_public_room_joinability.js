const assert = require('assert');
const http = require('http');
const { once } = require('events');
const WebSocket = require('ws');

const { startServer } = require('../../src/server/app/bootstrap');

function requestJson(baseUrl, targetPath) {
  const url = new URL(targetPath, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET' }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        resolve({
          status: res.statusCode || 0,
          json,
          text: raw,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForMessage(ws, matcher, timeoutMs = 10000) {
  const predicate = typeof matcher === 'string'
    ? (msg) => msg && msg.type === matcher
    : matcher;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error('timeout waiting for websocket message'));
    }, timeoutMs);
    function onMessage(raw) {
      let message = null;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (predicate(message)) {
        clearTimeout(timer);
        ws.removeListener('message', onMessage);
        resolve(message);
      }
    }
    ws.on('message', onMessage);
  });
}

async function waitFor(predicate, timeoutMs, intervalMs = 50) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function createStubRoom(code, status, players, overrides = {}) {
  return Object.assign({
    code,
    status,
    roomMode: 'standard',
    isPublic: true,
    players,
    lastActiveAt: Date.now(),
    game: null,
  }, overrides);
}

function createStubPlayer(id, options = {}) {
  return {
    id,
    name: id,
    isOnline: options.isOnline !== false,
    ws: options.ws !== undefined ? options.ws : (options.isOnline === false ? null : {}),
    disconnectedAt: options.disconnectedAt || null,
    graceDeadline: options.graceDeadline || null,
    reconnectToken: options.reconnectToken || `${id}_token`,
  };
}

async function connectClient(baseUrl) {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/`);
  const welcomePromise = waitForMessage(ws, 'welcome');
  await once(ws, 'open');
  const welcome = await welcomePromise;
  return { ws, welcome };
}

async function createLobbyRoom(baseUrl, name) {
  const host = await connectClient(baseUrl);
  const roomStatePromise = waitForMessage(host.ws, 'room_state');
  host.ws.send(JSON.stringify({
    type: 'create_room',
    payload: { name },
  }));
  const roomState = await roomStatePromise;
  return {
    ws: host.ws,
    welcome: host.welcome,
    roomCode: roomState && roomState.room ? roomState.room.code : '',
  };
}

async function listPublicRooms(baseUrl) {
  const response = await requestJson(baseUrl, '/api/public-rooms');
  assert.strictEqual(response.status, 200);
  return Array.isArray(response.json && response.json.rooms) ? response.json.rooms : [];
}

async function waitForPublicRoom(baseUrl, roomCode, matcher, timeoutMs = 5000) {
  return waitFor(async () => {
    const rooms = await listPublicRooms(baseUrl);
    const room = rooms.find((item) => item && item.code === roomCode) || null;
    if (typeof matcher === 'function') {
      return matcher(room, rooms) ? room : null;
    }
    return room;
  }, timeoutMs);
}

async function run() {
  const previousGrace = process.env.GPP_PLAYER_OFFLINE_GRACE_MS;
  const previousCleanup = process.env.GPP_ROOM_CLEANUP_INTERVAL_MS;
  process.env.GPP_PLAYER_OFFLINE_GRACE_MS = '250';
  process.env.GPP_ROOM_CLEANUP_INTERVAL_MS = '100';

  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  /** @type {WebSocket[]} */
  const sockets = [];

  try {
    const reservedNow = Date.now() + 60 * 1000;
    runtime.rooms.set('1001', createStubRoom('1001', 'in_game', [
      createStubPlayer('P1001A'),
    ]));
    runtime.rooms.set('1002', createStubRoom('1002', 'ended', [
      createStubPlayer('P1002A'),
    ]));
    runtime.rooms.set('1003', createStubRoom('1003', 'lobby', [
      createStubPlayer('P1003A'),
      createStubPlayer('P1003B', {
        isOnline: false,
        disconnectedAt: reservedNow,
        graceDeadline: reservedNow + 60 * 1000,
      }),
    ]));
    runtime.rooms.set('1004', createStubRoom('1004', 'lobby', [
      createStubPlayer('P1004A'),
      createStubPlayer('P1004B'),
    ]));
    runtime.rooms.set('1005', createStubRoom('1005', 'lobby', [
      createStubPlayer('P1005A'),
    ]));
    runtime.rooms.set('1006', createStubRoom('1006', 'lobby', [
      createStubPlayer('P1006A', {
        isOnline: false,
        disconnectedAt: reservedNow,
        graceDeadline: reservedNow + 60 * 1000,
      }),
    ]));

    const listResponse = await requestJson(baseUrl, '/api/public-rooms');
    assert.strictEqual(listResponse.status, 200);
    const rooms = Array.isArray(listResponse.json && listResponse.json.rooms) ? listResponse.json.rooms : [];
    const byCode = new Map(rooms.map((room) => [room.code, room]));
    assert.strictEqual(byCode.get('1001').joinableReason, 'in_game');
    assert.strictEqual(byCode.get('1002').joinableReason, 'ended');
    assert.strictEqual(byCode.get('1003').joinableReason, 'reserved_slot');
    assert.strictEqual(byCode.get('1004').joinableReason, 'room_full');
    assert.strictEqual(byCode.get('1005').joinableReason, 'ok');
    assert.strictEqual(byCode.get('1006').joinableReason, 'reserved_slot');

    const joiner = await connectClient(baseUrl);
    sockets.push(joiner.ws);

    const inGameErrorPromise = waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_IN_GAME');
    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1001' },
    }));
    const inGameError = await inGameErrorPromise;
    assert.strictEqual(inGameError.code, 'ROOM_IN_GAME');

    const endedErrorPromise = waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_ENDED');
    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1002' },
    }));
    const endedError = await endedErrorPromise;
    assert.strictEqual(endedError.code, 'ROOM_ENDED');

    const reservedErrorPromise = waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_RESERVED');
    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1003' },
    }));
    const reservedError = await reservedErrorPromise;
    assert.strictEqual(reservedError.code, 'ROOM_RESERVED');

    const fullErrorPromise = waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_FULL');
    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1004' },
    }));
    const fullError = await fullErrorPromise;
    assert.strictEqual(fullError.code, 'ROOM_FULL');

    const reservedHost = await createLobbyRoom(baseUrl, 'resume-host');
    sockets.push(reservedHost.ws);
    const reservedRoomCode = reservedHost.roomCode;
    const reservedReconnectToken = reservedHost.welcome.reconnectToken
      || (runtime.rooms.get(String(reservedRoomCode)).players[0] && runtime.rooms.get(String(reservedRoomCode)).players[0].reconnectToken)
      || '';
    assert.ok(/^\d{4}$/.test(String(reservedRoomCode || '')));
    assert.ok(typeof reservedReconnectToken === 'string' && reservedReconnectToken.length > 0);

    reservedHost.ws.close();
    await waitFor(() => {
      const room = runtime.rooms.get(String(reservedRoomCode));
      const player = room && room.players ? room.players[0] : null;
      return player && player.isOnline === false && Number.isFinite(player.graceDeadline) && player.graceDeadline > Date.now();
    }, 5000);

    const reservedSummary = await waitForPublicRoom(
      baseUrl,
      reservedRoomCode,
      (room) => !!room && room.joinableReason === 'reserved_slot' && room.joinable === false
    );
    assert.strictEqual(reservedSummary.joinableReason, 'reserved_slot');

    const reconnectingErrorPromise = waitForMessage(
      joiner.ws,
      (msg) => msg.type === 'error' && msg.code === 'ROOM_RESERVED'
    );
    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'blocked-joiner', code: reservedRoomCode },
    }));
    const reconnectingError = await reconnectingErrorPromise;
    assert.strictEqual(reconnectingError.code, 'ROOM_RESERVED');

    const resumeClient = await connectClient(baseUrl);
    sockets.push(resumeClient.ws);
    const resumedPromise = waitForMessage(
      resumeClient.ws,
      (msg) => msg.type === 'session_resumed' && msg.roomCode === reservedRoomCode
    );
    const resumedRoomStatePromise = waitForMessage(
      resumeClient.ws,
      (msg) => msg.type === 'room_state' && msg.room && msg.room.code === reservedRoomCode
    );
    resumeClient.ws.send(JSON.stringify({
      type: 'resume_session',
      payload: {
        roomCode: reservedRoomCode,
        reconnectToken: reservedReconnectToken,
      },
    }));
    const resumed = await resumedPromise;
    assert.strictEqual(resumed.roomCode, reservedRoomCode);
    const resumedRoomState = await resumedRoomStatePromise;
    assert.strictEqual(resumedRoomState.room.status, 'lobby');
    assert.strictEqual(resumedRoomState.room.players.length, 1);

    const resumeRoom = runtime.rooms.get(String(reservedRoomCode));
    assert.ok(resumeRoom);
    assert.strictEqual(resumeRoom.players[0].isOnline, true);
    assert.strictEqual(resumeRoom.players[0].graceDeadline, null);

    const restoredSummary = await waitForPublicRoom(
      baseUrl,
      reservedRoomCode,
      (room) => !!room && room.joinableReason === 'ok' && room.joinable === true
    );
    assert.strictEqual(restoredSummary.joinableReason, 'ok');

    const expiringHost = await createLobbyRoom(baseUrl, 'expiring-host');
    sockets.push(expiringHost.ws);
    const expiringRoomCode = expiringHost.roomCode;
    assert.ok(/^\d{4}$/.test(String(expiringRoomCode || '')));
    expiringHost.ws.close();

    await waitFor(() => {
      const room = runtime.rooms.get(String(expiringRoomCode));
      const player = room && room.players ? room.players[0] : null;
      return player && player.isOnline === false;
    }, 5000);

    await waitFor(() => !runtime.rooms.has(String(expiringRoomCode)), 5000);
    const finalRooms = await listPublicRooms(baseUrl);
    assert.strictEqual(finalRooms.some((room) => room && room.code === expiringRoomCode), false);

    const lateJoiner = await connectClient(baseUrl);
    sockets.push(lateJoiner.ws);
    const notFoundErrorPromise = waitForMessage(
      lateJoiner.ws,
      (msg) => msg.type === 'error' && msg.code === 'ROOM_NOT_FOUND'
    );
    lateJoiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'late-joiner', code: expiringRoomCode },
    }));
    const notFoundError = await notFoundErrorPromise;
    assert.strictEqual(notFoundError.code, 'ROOM_NOT_FOUND');

    console.log('test_public_room_joinability passed');
  } finally {
    if (previousGrace === undefined) delete process.env.GPP_PLAYER_OFFLINE_GRACE_MS;
    else process.env.GPP_PLAYER_OFFLINE_GRACE_MS = previousGrace;
    if (previousCleanup === undefined) delete process.env.GPP_ROOM_CLEANUP_INTERVAL_MS;
    else process.env.GPP_ROOM_CLEANUP_INTERVAL_MS = previousCleanup;

    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // Ignore best-effort socket close failures during cleanup.
      }
    }
    runtime.wss.close();
    runtime.server.close();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
