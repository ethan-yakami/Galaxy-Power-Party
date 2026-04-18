const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { once } = require('events');
const WebSocket = require('ws');
const { JSDOM } = require('jsdom');

const { loadBrowserBattleRuntime } = require('./battle_runtime_loader');
const { startServer } = require('../../src/server/app/bootstrap');

async function importCreateBattleApp() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/client/app/create-battle-app.js')).href;
  return import(moduleUrl);
}

async function waitFor(predicate, timeoutMs, intervalMs = 50) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
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

async function connectClient(baseUrl) {
  const ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/`);
  const welcomePromise = waitForMessage(ws, 'welcome');
  await once(ws, 'open');
  const welcome = await welcomePromise;
  return { ws, welcome };
}

async function createLobbyRoom(baseUrl, name = 'Host') {
  const host = await connectClient(baseUrl);
  const roomStatePromise = waitForMessage(host.ws, 'room_state');
  host.ws.send(JSON.stringify({
    type: 'create_room',
    payload: { name },
  }));
  const roomState = await roomStatePromise;
  return {
    ws: host.ws,
    roomCode: roomState && roomState.room ? roomState.room.code : '',
  };
}

async function runScenario({
  createBattleApp,
  port,
  mode,
  roomMode,
  playerCount,
  opponentId,
  hintFragment,
  code = '',
}) {
  let dom = null;
  try {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('name', '玩家535');
    if (code) params.set('code', code);

    dom = await JSDOM.fromFile(path.join(process.cwd(), 'src/client/battle.html'), {
      url: `http://127.0.0.1:${port}/battle.html?${params.toString()}`,
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
    });
    dom.window.WebSocket = WebSocket;
    dom.window.localStorage.setItem('gpp_access_token_v1', 'demo-access-token');

    await createBattleApp({
      document: dom.window.document,
      location: dom.window.location,
      runtimeLoader: loadBrowserBattleRuntime,
      windowRef: dom.window,
    });

    const state = await waitFor(() => {
      const appState = dom.window.__GPP_BATTLE_APP__ && dom.window.__GPP_BATTLE_APP__.state;
      const flow = appState && appState.ui ? appState.ui.launchFlow : null;
      if (!appState || !appState.room || !flow) return null;
      if (!/^\d{4}$/.test(String(appState.room.code || ''))) return null;
      if (!flow.roomAckReceived) return null;
      return appState;
    }, 10000);

    assert.strictEqual(state.ui.welcomeReceived, true, `${mode} welcome should arrive before launch intent dispatch`);
    assert.strictEqual(state.ui.launchIntentConsumed, true, `${mode} launch intent should be consumed after room creation`);
    assert.strictEqual(state.ui.launchFlow.roomAckReceived, true, `${mode} should record room acknowledgement`);
    assert.strictEqual(state.ui.launchFlow.roomRequestSent, false, `${mode} room request flag should clear after ack`);
    assert.strictEqual(state.room.roomMode, roomMode, `${mode} room_state should expose the expected room mode`);
    assert.strictEqual(state.room.status, 'lobby', `${mode} launch should land in lobby before player loadout submit`);
    assert.strictEqual(state.room.players.length, playerCount, `${mode} room should contain the expected player count`);
    if (opponentId) {
      assert.strictEqual(state.room.players[1].id, opponentId, `${mode} second player should match expectation`);
    }
    if (code) {
      assert.strictEqual(state.room.code, code, `${mode} should join the requested room`);
    }

    const app = dom.window.__GPP_BATTLE_APP__;
    const timing = app.startupTiming;
    await waitFor(() => timing.auth_state_received_at > 0, 5000);
    assert(timing.battle_runtime_ready_at >= timing.battle_bootstrap_started_at, `${mode} runtime timing should be recorded`);
    assert(timing.socket_connect_requested_at > 0, `${mode} socket connect timing should be recorded`);
    assert(timing.welcome_received_at > 0, `${mode} welcome timing should be recorded`);
    assert(timing.launch_intent_dispatched_at > 0, `${mode} launch dispatch timing should be recorded`);
    assert(timing.room_state_received_at > 0, `${mode} room timing should be recorded`);
    assert(timing.launch_intent_dispatched_at >= timing.welcome_received_at, `${mode} launch should happen after welcome`);
    assert(timing.launch_intent_dispatched_at <= timing.auth_state_received_at, `${mode} launch should not wait for auth_state`);

    const timingSummary = app.windowRef.GPP.getStartupTimingSummary();
    assert(Number.isFinite(timingSummary.runtime_boot_ms), `${mode} timing summary should expose runtime boot cost`);
    assert(Number.isFinite(timingSummary.socket_to_welcome_ms), `${mode} timing summary should expose websocket cost`);
    assert(Number.isFinite(timingSummary.launch_to_room_ms), `${mode} timing summary should expose room creation cost`);

    const launchHint = dom.window.document.getElementById('launchHint');
    const lobbyHint = dom.window.document.getElementById('lobbyHint');
    const roomPanel = dom.window.document.getElementById('roomPanel');
    const connectionPanel = dom.window.document.getElementById('connectionPanel');

    assert(launchHint, `${mode} launch hint should exist`);
    assert(lobbyHint, `${mode} lobby hint should exist`);
    assert(roomPanel, `${mode} room panel should exist`);
    assert(connectionPanel, `${mode} connection panel should exist`);
    assert(launchHint.textContent.includes(hintFragment), `${mode} launch hint should explain the room follow-up`);
    if (mode === 'ai') {
      assert(lobbyHint.textContent.includes('AI'), 'ai lobby hint should explain AI loadout step');
    }
    assert.strictEqual(roomPanel.classList.contains('hidden'), false, `${mode} room panel should become visible`);
    assert.strictEqual(connectionPanel.classList.contains('hidden'), true, `${mode} connection panel should hide once room is ready`);
  } finally {
    const ws = dom && dom.window && dom.window.__GPP_BATTLE_APP__ && dom.window.__GPP_BATTLE_APP__.transport
      ? dom.window.__GPP_BATTLE_APP__.transport.ws
      : null;
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.close();
      } catch {
        // Ignore close races during cleanup.
      }
    }
    if (dom) {
      dom.window.close();
    }
  }
}

async function main() {
  const { createBattleApp } = await importCreateBattleApp();
  const port = 34000 + Math.floor(Math.random() * 1000);
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';

  const runtime = startServer();
  const sockets = [];
  try {
    const baseUrl = `http://127.0.0.1:${port}`;

    await runScenario({
      createBattleApp,
      port,
      mode: 'ai',
      roomMode: 'ai',
      playerCount: 2,
      opponentId: 'AI',
      hintFragment: 'AI 房间',
    });

    await runScenario({
      createBattleApp,
      port,
      mode: 'create',
      roomMode: 'standard',
      playerCount: 1,
      hintFragment: '请完成大厅配置',
    });

    const host = await createLobbyRoom(baseUrl, 'join-host');
    sockets.push(host.ws);
    await runScenario({
      createBattleApp,
      port,
      mode: 'join',
      roomMode: 'standard',
      playerCount: 2,
      hintFragment: '请完成大厅配置',
      code: host.roomCode,
    });

    console.log('battle-launch-intent test passed');
  } finally {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // Ignore best-effort socket close failures during cleanup.
      }
    }
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
