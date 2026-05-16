const assert = require('assert');
const path = require('path');
const { JSDOM } = require('jsdom');

function makeDom() {
  return new JSDOM(`<!doctype html><html><body>
    <div id="selfZone"></div>
    <div id="enemyZone"></div>
    <div id="actionRail"></div>
    <div id="logBox"></div>
    <div id="logDrawer"></div>
    <button id="logToggleBtn"></button>
    <div id="connectionPanel"></div>
    <div id="roomPanel"></div>
    <div id="headerRoomInfo"></div>
    <div id="roomStatusBar"></div>
    <div id="lobbyArea"></div>
    <div id="lobbyControls"></div>
    <div id="roomCode"></div>
    <div id="playersList"></div>
    <div id="weatherStatusCard"></div>
    <div id="turnOwnershipCard"></div>
    <div id="roundInfo"></div>
    <div id="turnInfo"></div>
    <div id="weatherBanner"></div>
    <div id="battleCenterScore"></div>
    <div id="replayControls"></div>
    <button id="replayPrevBtn"></button>
    <button id="replayNextBtn"></button>
    <input id="replayStepRange" />
    <div id="replayStepLabel"></div>
    <div id="replayActionLabel"></div>
  </body></html>`, {
    url: 'http://localhost:3000/battle.html?mode=ai&name=tester',
    pretendToBeVisual: true,
  });
}

function requireFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function setupGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  global.navigator = dom.window.navigator;
  global.Event = dom.window.Event;
}

function cleanupGlobals() {
  delete global.window;
  delete global.document;
  delete global.location;
  delete global.localStorage;
  delete global.sessionStorage;
  delete global.navigator;
  delete global.Event;
  delete global.GPP;
}

function createState() {
  const attackDice = [
    { value: 8, label: '8A', isAurora: true, auroraId: 'prime', auroraName: 'Prime', effectText: 'Aura', conditionText: 'Always' },
    { value: 6, label: '6A', isAurora: true, auroraId: 'prime', auroraName: 'Prime', effectText: 'Aura', conditionText: 'Always' },
    { value: 4, label: '4', isAurora: false, sides: 6 },
    { value: 7, label: '7A', isAurora: true, auroraId: 'prime', auroraName: 'Prime', effectText: 'Aura', conditionText: 'Always' },
  ];
  return {
    me: 'P1',
    room: {
      code: '1234',
      players: [
        { id: 'P1', name: 'Tester', characterId: 'liuying', auroraDiceId: 'prime', auroraSelectionConfirmed: true, isOnline: true },
        { id: 'P2', name: 'Enemy', characterId: 'huangquan', auroraDiceId: 'prime', auroraSelectionConfirmed: true, isOnline: true },
      ],
      game: {
        status: 'in_game',
        round: 1,
        phase: 'attack_reroll_or_select',
        attackerId: 'P1',
        defenderId: 'P2',
        attackDice,
        defenseDice: [],
        attackSelection: [],
        defenseSelection: [],
        attackPreviewSelection: [],
        defensePreviewSelection: [],
        attackValue: null,
        defenseValue: null,
        attackPierce: false,
        lastDamage: null,
        winnerId: null,
        log: [],
        hp: { P1: 10, P2: 10 },
        maxHp: { P1: 10, P2: 10 },
        attackLevel: { P1: 2, P2: 2 },
        defenseLevel: { P1: 2, P2: 2 },
        auroraUsesRemaining: { P1: 1, P2: 1 },
        selectedFourCount: { P1: 0, P2: 0 },
        selectedOneCount: { P1: 0, P2: 0 },
        overload: { P1: 0, P2: 0 },
        desperateBonus: { P1: 0, P2: 0 },
        auroraAEffectCount: { P1: 0, P2: 0 },
        roundAuroraUsed: { P1: false, P2: false },
        forceField: { P1: false, P2: false },
        whiteeGuardUsed: { P1: false, P2: false },
        whiteeGuardActive: { P1: false, P2: false },
        unyielding: { P1: false, P2: false },
        counterActive: { P1: false, P2: false },
        effectEvents: [],
        weather: null,
        poison: { P1: 0, P2: 0 },
        resilience: { P1: 0, P2: 0 },
        thorns: { P1: 0, P2: 0 },
        power: { P1: 0, P2: 0 },
        hackActive: { P1: false, P2: false },
        danhengCounterReady: { P1: false, P2: false },
        xilianCumulative: { P1: 0, P2: 0 },
        xilianAscensionActive: { P1: false, P2: false },
        yaoguangRerollsUsed: { P1: 0, P2: 0 },
      },
    },
    selectedDice: new Set(),
    characters: {
      liuying: { id: 'liuying', name: 'Test A', hp: 10, shortSpec: 'spec', skillText: 'skill' },
      huangquan: { id: 'huangquan', name: 'Test B', hp: 10, shortSpec: 'spec', skillText: 'skill' },
    },
    auroraDice: [
      { id: 'prime', name: 'Prime', facesText: 'A', effectText: 'Aura', conditionText: 'Always' },
    ],
    battleActions: null,
    pendingAction: null,
    lastProcessedEffectId: 0,
    ui: {
      scene: 'battle',
      logDrawerOpen: false,
      replay: { enabled: false, replay: null, currentIndex: 0 },
      connection: {},
    },
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dom = makeDom();
  setupGlobals(dom);

  const state = createState();
  const sentMessages = [];
  const baseGpp = {
    state,
    dom: {
      selfZone: document.getElementById('selfZone'),
      enemyZone: document.getElementById('enemyZone'),
      actionRail: document.getElementById('actionRail'),
      logBox: document.getElementById('logBox'),
      logDrawer: document.getElementById('logDrawer'),
      logToggleBtn: document.getElementById('logToggleBtn'),
      connectionPanel: document.getElementById('connectionPanel'),
      roomPanel: document.getElementById('roomPanel'),
      headerRoomInfo: document.getElementById('headerRoomInfo'),
      roomStatusBar: document.getElementById('roomStatusBar'),
      lobbyArea: document.getElementById('lobbyArea'),
      lobbyControls: document.getElementById('lobbyControls'),
      roomCodeEl: document.getElementById('roomCode'),
      playersList: document.getElementById('playersList'),
      weatherStatusCard: document.getElementById('weatherStatusCard'),
      turnOwnershipCard: document.getElementById('turnOwnershipCard'),
      roundInfo: document.getElementById('roundInfo'),
      turnInfo: document.getElementById('turnInfo'),
      weatherBanner: document.getElementById('weatherBanner'),
      battleCenterScore: document.getElementById('battleCenterScore'),
      replayControls: document.getElementById('replayControls'),
      replayPrevBtn: document.getElementById('replayPrevBtn'),
      replayNextBtn: document.getElementById('replayNextBtn'),
      replayStepRange: document.getElementById('replayStepRange'),
      replayStepLabel: document.getElementById('replayStepLabel'),
      replayActionLabel: document.getElementById('replayActionLabel'),
    },
    send(type, payload) {
      sentMessages.push({ type, payload });
    },
    sanitizeDisplayName(name) { return String(name || ''); },
    getWeatherDisplay() {
      return { typeClass: 'clear', name: 'Clear', type: 'clear', stageRound: 0, condition: '', effect: '' };
    },
    showWinnerOverlay() {},
    hideWinnerOverlay() {},
    selectors: {},
    battleActionMap: {},
  };
  global.GPP = baseGpp;
  dom.window.GPP = baseGpp;
  const gpp = global.GPP;

  requireFresh(path.join(process.cwd(), 'src/client/js/dice-ui.js'));
  requireFresh(path.join(process.cwd(), 'src/client/js/render.js'));

  const originalRender = gpp.render;
  originalRender();

  let renderCount = 0;
  gpp.render = function wrappedRender() {
    renderCount += 1;
    return originalRender.apply(this, arguments);
  };

  const row = document.querySelector('#selfZone [data-selection-row="true"]');
  const diceNodes = Array.from(document.querySelectorAll('#selfZone .die'));
  assert(row, 'should render a selectable dice row');
  assert.strictEqual(diceNodes.length, 4, 'should render four dice');

  const bounds = [
    { left: 0, right: 60, top: 0, bottom: 60, width: 60, height: 60 },
    { left: 76, right: 136, top: 0, bottom: 60, width: 60, height: 60 },
    { left: 152, right: 212, top: 0, bottom: 60, width: 60, height: 60 },
    { left: 228, right: 288, top: 0, bottom: 60, width: 60, height: 60 },
  ];
  let capturedPointerId = null;
  row.setPointerCapture = (pointerId) => {
    capturedPointerId = pointerId;
  };
  row.releasePointerCapture = (pointerId) => {
    if (capturedPointerId === pointerId) capturedPointerId = null;
  };
  row.hasPointerCapture = (pointerId) => capturedPointerId === pointerId;

  diceNodes.forEach((node, index) => {
    node.getBoundingClientRect = () => bounds[index];
  });
  document.elementFromPoint = (x, y) => {
    for (let i = 0; i < bounds.length; i += 1) {
      const rect = bounds[i];
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return diceNodes[i];
      }
    }
    return row;
  };

  const [firstDie, secondDie, thirdDie, fourthDie] = diceNodes;
  const badge = document.querySelector('#selfZone [data-selection-badge="true"]');

  fourthDie.onpointerdown({
    preventDefault() {},
    button: 0,
    pointerId: 11,
    clientX: 250,
    clientY: 30,
    target: fourthDie,
  });
  row.onpointerup({ pointerId: 11 });
  fourthDie.onclick({ preventDefault() {} });
  assert(state.selectedDice.has(3), 'single pointer tap should select immediately without waiting for click');

  state.selectedDice.clear();
  gpp.refreshDiceSelectionUi();

  firstDie.onpointerdown({
    preventDefault() {},
    button: 0,
    pointerId: 7,
    clientX: 30,
    clientY: 30,
    target: firstDie,
  });
  assert.strictEqual(row.hasPointerCapture(7), true, 'row should capture the active pointer');
  row.onpointermove({ pointerId: 7, clientX: 72, clientY: 30, target: row });
  row.onpointermove({ pointerId: 7, clientX: 148, clientY: 30, target: row });

  assert.strictEqual(renderCount, 0, 'dragging across dice should not trigger full render');
  assert(firstDie.classList.contains('selected'));
  assert(secondDie.classList.contains('selected'));
  assert(thirdDie.classList.contains('dragSelecting'));
  assert(thirdDie.classList.contains('selected'));
  assert.strictEqual(secondDie.getAttribute('aria-pressed'), 'true');
  assert(badge.textContent.includes('3'), 'selection badge should update locally while dragging');

  row.onpointerup({ pointerId: 7 });
  assert.strictEqual(document.querySelectorAll('#selfZone .die.dragSelecting').length, 0, 'drag state should clear on pointerup');

  await wait(95);
  assert(sentMessages.some((entry) => entry.type === 'update_live_selection'), 'dragging should still sync live selection');
  assert.deepStrictEqual(sentMessages[sentMessages.length - 1], {
    type: 'update_live_selection',
    payload: { indices: [0, 1, 2] },
  });
  const sentCountAfterDrag = sentMessages.length;
  gpp.refreshDiceSelectionUi();
  await wait(95);
  assert.strictEqual(sentMessages.length, sentCountAfterDrag, 'unchanged live selection should not send a duplicate sync');

  console.log('dice-drag-ui test passed');
  dom.window.close();
  cleanupGlobals();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
