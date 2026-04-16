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

function createStubPlayer(id, isOnline, wsRef) {
  return {
    id,
    name: id,
    isOnline,
    ws: wsRef || null,
  };
}

async function connectClient(baseUrl) {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/`);
  await once(ws, 'open');
  const welcome = await waitForMessage(ws, 'welcome');
  return { ws, welcome };
}

async function run() {
  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  /** @type {WebSocket[]} */
  const sockets = [];

  try {
    runtime.rooms.set('1001', createStubRoom('1001', 'in_game', [
      createStubPlayer('P1001A', true, {}),
    ]));
    runtime.rooms.set('1002', createStubRoom('1002', 'ended', [
      createStubPlayer('P1002A', true, {}),
    ]));
    runtime.rooms.set('1003', createStubRoom('1003', 'lobby', [
      createStubPlayer('P1003A', true, {}),
      createStubPlayer('P1003B', false, null),
    ]));
    runtime.rooms.set('1004', createStubRoom('1004', 'lobby', [
      createStubPlayer('P1004A', true, {}),
      createStubPlayer('P1004B', true, {}),
    ]));
    runtime.rooms.set('1005', createStubRoom('1005', 'lobby', [
      createStubPlayer('P1005A', true, {}),
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

    const joiner = await connectClient(baseUrl);
    sockets.push(joiner.ws);

    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1001' },
    }));
    const inGameError = await waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_IN_GAME');
    assert.strictEqual(inGameError.code, 'ROOM_IN_GAME');

    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'joiner', code: '1002' },
    }));
    const endedError = await waitForMessage(joiner.ws, (msg) => msg.type === 'error' && msg.code === 'ROOM_ENDED');
    assert.strictEqual(endedError.code, 'ROOM_ENDED');

    const host = await connectClient(baseUrl);
    sockets.push(host.ws);
    host.ws.send(JSON.stringify({
      type: 'create_room',
      payload: { name: 'resume-host' },
    }));
    const hostRoomState = await waitForMessage(host.ws, 'room_state');
    const resumeRoomCode = hostRoomState.room && hostRoomState.room.code;
    assert.ok(/^\d{4}$/.test(String(resumeRoomCode || '')));
    const resumeRoom = runtime.rooms.get(String(resumeRoomCode));
    assert.ok(resumeRoom);
    resumeRoom.roomMode = 'resume_room';
    resumeRoom.isPublic = true;
    resumeRoom.status = 'lobby';

    joiner.ws.send(JSON.stringify({
      type: 'join_room',
      payload: { name: 'resume-joiner', code: resumeRoomCode },
    }));
    const joinResumeRoomState = await waitForMessage(
      joiner.ws,
      (msg) => msg.type === 'room_state' && msg.room && msg.room.code === resumeRoomCode
    );
    assert.strictEqual(joinResumeRoomState.room.status, 'lobby');
    assert.strictEqual(joinResumeRoomState.room.roomMode, 'resume_room');
    assert.strictEqual(joinResumeRoomState.room.players.length, 2);

    console.log('test_public_room_joinability passed');
  } finally {
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
