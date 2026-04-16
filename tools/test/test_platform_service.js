const assert = require('assert');
const http = require('http');
const { once } = require('events');
const WebSocket = require('ws');

const { startServer } = require('../../src/server/app/bootstrap');
const { CharacterRegistry, AuroraRegistry, allowsNoAurora } = require('../../src/server/services/registry');

function request(baseUrl, method, targetPath, body, headers = {}) {
  const url = new URL(targetPath, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text: raw,
          json: parsed,
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function waitForMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error(`timeout waiting for ws message: ${type}`));
    }, 10000);
    function onMessage(raw) {
      const message = JSON.parse(String(raw));
      if (message.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', onMessage);
        resolve(message);
      }
    }
    ws.on('message', onMessage);
  });
}

async function createAuthenticatedAiReplay(baseUrl, accessToken) {
  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/?accessToken=${encodeURIComponent(accessToken)}`;
  const ws = new WebSocket(wsUrl);
  await once(ws, 'open');
  await waitForMessage(ws, 'welcome');

  const character = Object.values(CharacterRegistry)[0];
  const aurora = Object.values(AuroraRegistry)[0];
  assert.ok(character);
  assert.ok(aurora);

  ws.send(JSON.stringify({
    type: 'create_ai_room',
    payload: { name: 'service-test' },
  }));
  await waitForMessage(ws, 'room_state');

  ws.send(JSON.stringify({
    type: 'choose_character',
    payload: { characterId: character.id },
  }));
  await waitForMessage(ws, 'room_state');

  if (!allowsNoAurora(character)) {
    ws.send(JSON.stringify({
      type: 'choose_aurora_die',
      payload: { auroraDiceId: aurora.id },
    }));
  }
  await waitForMessage(ws, 'battle_actions');

  ws.send(JSON.stringify({
    type: 'export_replay',
    payload: { requestSource: 'service-test' },
    meta: { requestId: 'svc-export-1', protocolVersion: '2' },
  }));
  const replayMessage = await waitForMessage(ws, 'replay_export');
  ws.close();
  return replayMessage;
}

async function run() {
  process.env.GPP_ADMIN_TOKEN = 'test-admin-token';
  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await request(baseUrl, 'GET', '/api/healthz');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);

    const ready = await request(baseUrl, 'GET', '/api/readyz');
    assert.strictEqual(ready.status, 200);
    assert.strictEqual(ready.json.ok, true);

    const register = await request(baseUrl, 'POST', '/api/auth/register', {
      username: 'service_test_user',
      password: 'password123',
    });
    assert.strictEqual(register.status, 201);
    assert.strictEqual(register.json.ok, true);
    assert.ok(register.json.accessToken);
    assert.ok(register.json.refreshToken);

    const me = await request(baseUrl, 'GET', '/api/me', null, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.json.user.usernameNormalized, 'service_test_user');

    const replayListBefore = await request(baseUrl, 'GET', '/api/replays', null, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(replayListBefore.status, 200);
    assert.deepStrictEqual(replayListBefore.json.items, []);

    const refreshed = await request(baseUrl, 'POST', '/api/auth/refresh', {
      refreshToken: register.json.refreshToken,
    });
    assert.strictEqual(refreshed.status, 200);
    assert.ok(refreshed.json.accessToken);

    const replayExport = await createAuthenticatedAiReplay(baseUrl, register.json.accessToken);
    assert.strictEqual(replayExport.type, 'replay_export');
    assert.ok(replayExport.content);

    const replayListAfter = await request(baseUrl, 'GET', '/api/replays', null, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(replayListAfter.status, 200);
    assert.strictEqual(replayListAfter.json.items.length, 1);
    const replayId = replayListAfter.json.items[0].replayId;

    const replayDetail = await request(baseUrl, 'GET', `/api/replays/${encodeURIComponent(replayId)}`, null, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(replayDetail.status, 200);
    assert.strictEqual(replayDetail.json.ok, true);
    assert.ok(replayDetail.json.replay);

    const metricsUnauthorized = await request(baseUrl, 'GET', '/api/metrics');
    assert.strictEqual(metricsUnauthorized.status, 401);

    const debugUnauthorized = await request(baseUrl, 'GET', '/api/debug/rooms');
    assert.strictEqual(debugUnauthorized.status, 401);

    const metrics = await request(baseUrl, 'GET', '/api/metrics', null, {
      'x-admin-token': 'test-admin-token',
    });
    assert.strictEqual(metrics.status, 200);
    assert.ok(metrics.text.includes('gpp_http_requests_total'));
    assert.ok(metrics.text.includes('gpp_replay_exports_total'));

    const logout = await request(baseUrl, 'POST', '/api/auth/logout', {
      refreshToken: register.json.refreshToken,
    }, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(logout.status, 200);

    const meAfterLogout = await request(baseUrl, 'GET', '/api/me', null, {
      Authorization: `Bearer ${register.json.accessToken}`,
    });
    assert.strictEqual(meAfterLogout.status, 401);
    console.log('test_platform_service passed');
  } finally {
    runtime.wss.close();
    runtime.server.close();
    delete process.env.GPP_ADMIN_TOKEN;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
