const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

const { loadBrowserBattleRuntime } = require('./battle_runtime_loader');
const replayHistory = require('../../src/client/js/replay-history');
const { startServer } = require('../../src/server/app/bootstrap');

const PAGE_PATH = path.join(process.cwd(), 'src/client/battle-next.html');

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

function buildReplay() {
  const players = [
    { playerId: 'P1', name: 'Viewer', characterId: 'liuying', auroraDiceId: 'prime', hp: 10, maxHp: 10 },
    { playerId: 'P2', name: 'AI', characterId: 'huangquan', auroraDiceId: 'prime', hp: 10, maxHp: 10 },
  ];
  const commonView = {
    status: 'in_game',
    attackerId: 'P1',
    defenderId: 'P2',
    winnerId: null,
    attackValue: null,
    defenseValue: null,
    lastDamage: null,
    attackDice: [],
    defenseDice: [],
    attackSelection: [],
    defenseSelection: [],
    hp: { P1: 10, P2: 10 },
    attackLevel: { P1: 2, P2: 2 },
    defenseLevel: { P1: 1, P2: 1 },
    auroraUsesRemaining: { P1: 1, P2: 1 },
    selectedFourCount: { P1: 0, P2: 0 },
    selectedOneCount: { P1: 0, P2: 0 },
    overload: { P1: 0, P2: 0 },
    desperateBonus: { P1: 0, P2: 0 },
    auroraAEffectCount: { P1: 0, P2: 0 },
    poison: { P1: 0, P2: 0 },
    resilience: { P1: 0, P2: 0 },
    thorns: { P1: 0, P2: 0 },
    power: { P1: 0, P2: 0 },
    xilianCumulative: { P1: 0, P2: 0 },
    yaoguangRerollsUsed: { P1: 0, P2: 0 },
    roundAuroraUsed: { P1: false, P2: false },
    forceField: { P1: false, P2: false },
    hackActive: { P1: false, P2: false },
    danhengCounterReady: { P1: false, P2: false },
    xilianAscensionActive: { P1: false, P2: false },
    whiteeGuardUsed: { P1: false, P2: false },
    whiteeGuardActive: { P1: false, P2: false },
    unyielding: { P1: false, P2: false },
    counterActive: { P1: false, P2: false },
    weather: null,
    players,
  };

  return {
    replayId: 'demo-replay',
    version: 'ReplayV2',
    engineMode: 'pure',
    protocolModel: 'action_ticket',
    seed: 'demo-seed',
    roomMeta: {
      roomCode: '7777',
      startedAt: 1710000000000,
      startingAttacker: 0,
      endedAt: 1710000001000,
      resumedFromReplayId: null,
      resumedFromStep: null,
      roomMode: 'ai',
    },
    playersLoadout: players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      characterId: player.characterId,
      auroraDiceId: player.auroraDiceId,
    })),
    actions: [
      {
        step: 1,
        actor: 'P1',
        phaseBefore: 'attack_roll',
        actionCode: 'roll_attack',
        opcode: 1,
        actionMask: 0,
        indices: [],
        encodedAction: 1,
        turnId: 1,
        actionId: 'act-1',
        actionSnapshotHash: 'hash-1',
        mutationLog: null,
        timestamp: 1710000000100,
      },
    ],
    stepDetails: [
      {
        step: 1,
        actionOutcome: { ok: true, reason: '', phase: 'attack_reroll_or_select', status: 'in_game', winner: null, weatherChangedRound: null },
        logsAdded: ['Viewer rolled attack dice'],
        effectsAdded: [],
        phaseBefore: 'attack_roll',
        phaseAfter: 'attack_reroll_or_select',
        roundBefore: 1,
        roundAfter: 1,
        winnerAfter: null,
      },
    ],
    snapshots: [
      {
        step: 0,
        reason: 'initial_state',
        timestamp: 1710000000000,
        round: 1,
        phase: 'attack_roll',
        status: 'in_game',
        winnerPlayerId: null,
        state: {},
        view: Object.assign({}, commonView, {
          round: 1,
          phase: 'attack_roll',
          logTail: ['Battle started'],
        }),
      },
      {
        step: 1,
        reason: 'after_action',
        timestamp: 1710000000100,
        round: 1,
        phase: 'attack_reroll_or_select',
        status: 'in_game',
        winnerPlayerId: null,
        state: {},
        view: Object.assign({}, commonView, {
          round: 1,
          phase: 'attack_reroll_or_select',
          attackDice: [{ value: 8, label: '8', hasA: false, isAurora: false, maxValue: 8 }],
          logTail: ['Viewer rolled attack dice'],
        }),
      },
    ],
    result: {
      winnerPlayerId: null,
      rounds: 1,
      endedReason: '',
      endedAt: null,
    },
  };
}

async function openDom(url) {
  const dom = await JSDOM.fromFile(PAGE_PATH, {
    url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  dom.window.WebSocket = require('ws');
  return dom;
}

async function runLaunchScenario({ createBattleApp, port, mode, expectedRoomMode }) {
  let dom = null;
  try {
    dom = await openDom(`http://127.0.0.1:${port}/battle-next.html?mode=${encodeURIComponent(mode)}&name=${encodeURIComponent('NovaTester')}`);
    dom.window.localStorage.setItem('gpp_access_token_v1', 'demo-access-token');

    await createBattleApp({
      document: dom.window.document,
      location: dom.window.location,
      runtimeLoader: loadBrowserBattleRuntime,
      windowRef: dom.window,
    });

    const state = await waitFor(() => {
      const appState = dom.window.__GPP_BATTLE_APP__ && dom.window.__GPP_BATTLE_APP__.state;
      return appState && appState.room ? appState : null;
    }, 10000);

    const roomPanel = dom.window.document.getElementById('roomPanel');
    const connectionPanel = dom.window.document.getElementById('connectionPanel');
    const lobbyHint = dom.window.document.getElementById('lobbyHint');

    assert.strictEqual(dom.window.document.body.getAttribute('data-battle-theme'), 'nova');
    assert(dom.window.document.querySelector('.novaBattleBoard'));
    assert(dom.window.document.querySelector('.novaBackdrop'));
    assert.strictEqual(state.room.roomMode, expectedRoomMode);
    assert.strictEqual(state.room.status, 'lobby');
    assert.strictEqual(roomPanel.classList.contains('hidden'), false);
    assert.strictEqual(connectionPanel.classList.contains('hidden'), true);
    assert(lobbyHint.textContent.trim().length > 0);

    if (mode === 'ai') {
      assert.strictEqual(state.room.players.length, 2);
      assert.strictEqual(state.room.players[1].id, 'AI');
      assert(lobbyHint.textContent.includes('AI'));
    }

    if (mode === 'create') {
      assert.strictEqual(state.room.players.length, 1);
    }
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

async function runReplayScenario({ createBattleApp, port }) {
  let dom = null;
  try {
    dom = await openDom(`http://127.0.0.1:${port}/battle-next.html?mode=replay&replayId=demo-replay`);
    dom.window.localStorage.setItem(replayHistory.STORAGE_KEY, JSON.stringify([
      {
        savedAt: 1710000000200,
        replay: buildReplay(),
      },
    ]));

    await createBattleApp({
      document: dom.window.document,
      location: dom.window.location,
      runtimeLoader: loadBrowserBattleRuntime,
      windowRef: dom.window,
    });

    const state = await waitFor(() => {
      const appState = dom.window.__GPP_BATTLE_APP__ && dom.window.__GPP_BATTLE_APP__.state;
      return appState && appState.ui && appState.ui.replay && appState.ui.replay.enabled && appState.room ? appState : null;
    }, 5000);

    const replayControls = dom.window.document.getElementById('replayControls');
    const roomPanel = dom.window.document.getElementById('roomPanel');
    const connectionPanel = dom.window.document.getElementById('connectionPanel');
    const replayStepLabel = dom.window.document.getElementById('replayStepLabel');
    const replayNextBtn = dom.window.document.getElementById('replayNextBtn');

    assert.strictEqual(dom.window.document.body.getAttribute('data-battle-theme'), 'nova');
    assert.strictEqual(state.room.roomMode, 'replay');
    assert.strictEqual(dom.window.__GPP_BATTLE_APP__.transport.ws, null);
    assert.strictEqual(replayControls.classList.contains('hidden'), false);
    assert.strictEqual(roomPanel.classList.contains('hidden'), false);
    assert.strictEqual(connectionPanel.classList.contains('hidden'), true);
    assert(replayStepLabel.textContent.includes('Step 0/1'));

    replayNextBtn.click();
    assert.strictEqual(state.ui.replay.currentIndex, 1);
    assert(replayStepLabel.textContent.includes('Step 1/1'));
  } finally {
    if (dom) {
      dom.window.close();
    }
  }
}

async function main() {
  const { createBattleApp } = await importCreateBattleApp();
  const port = 36000 + Math.floor(Math.random() * 1000);
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';

  const runtime = startServer();
  try {
    await runLaunchScenario({
      createBattleApp,
      port,
      mode: 'ai',
      expectedRoomMode: 'ai',
    });
    await runLaunchScenario({
      createBattleApp,
      port,
      mode: 'create',
      expectedRoomMode: 'standard',
    });
    await runReplayScenario({
      createBattleApp,
      port,
    });
    console.log('battle-next-preview test passed');
  } finally {
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
