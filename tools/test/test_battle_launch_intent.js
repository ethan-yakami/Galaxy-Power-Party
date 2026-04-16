const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

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

async function main() {
  const { createBattleApp } = await importCreateBattleApp();
  const port = 34000 + Math.floor(Math.random() * 1000);
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';

  const runtime = startServer();
  let dom = null;
  try {
    dom = await JSDOM.fromFile(path.join(process.cwd(), 'src/client/battle.html'), {
      url: `http://127.0.0.1:${port}/battle.html?mode=ai&name=${encodeURIComponent('玩家535')}`,
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
    });
    dom.window.WebSocket = require('ws');

    await createBattleApp({
      document: dom.window.document,
      location: dom.window.location,
      windowRef: dom.window,
    });

    const state = await waitFor(() => {
      const appState = dom.window.__GPP_BATTLE_APP__ && dom.window.__GPP_BATTLE_APP__.state;
      return appState && appState.room ? appState : null;
    }, 10000);

    assert.strictEqual(state.ui.welcomeReceived, true, 'welcome should arrive before launch intent dispatch');
    assert.strictEqual(state.ui.launchIntentConsumed, true, 'AI launch intent should be consumed after room creation');
    assert.strictEqual(state.room.roomMode, 'ai', 'room_state should expose ai room mode');
    assert.strictEqual(state.room.status, 'lobby', 'AI launch should land in lobby before player loadout submit');
    assert.strictEqual(state.room.players.length, 2, 'AI room should contain player and AI opponent');
    assert.strictEqual(state.room.players[1].id, 'AI', 'second player should be AI');

    const launchHint = dom.window.document.getElementById('launchHint');
    const lobbyHint = dom.window.document.getElementById('lobbyHint');
    const roomPanel = dom.window.document.getElementById('roomPanel');
    const connectionPanel = dom.window.document.getElementById('connectionPanel');

    assert(launchHint, 'launch hint should exist');
    assert(lobbyHint, 'lobby hint should exist');
    assert(roomPanel, 'room panel should exist');
    assert(connectionPanel, 'connection panel should exist');
    assert(launchHint.textContent.includes('AI'), 'launch hint should explain AI room follow-up');
    assert(lobbyHint.textContent.includes('AI'), 'lobby hint should explain AI loadout step');
    assert.strictEqual(roomPanel.classList.contains('hidden'), false, 'room panel should become visible');
    assert.strictEqual(connectionPanel.classList.contains('hidden'), true, 'connection panel should hide once room is ready');

    console.log('battle-launch-intent test passed');
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
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
