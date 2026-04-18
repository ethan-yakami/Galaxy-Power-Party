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
      liuying: { id: 'liuying', name: '流萤', hp: 10, shortSpec: 'spec', skillText: 'skill' },
      huangquan: { id: 'huangquan', name: '黄泉', hp: 10, shortSpec: 'spec', skillText: 'skill' },
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

function main() {
  const dom = makeDom();
  setupGlobals(dom);

  const state = createState();
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
    send() {},
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

  const diceNodesBefore = Array.from(document.querySelectorAll('#selfZone .die'));
  assert.strictEqual(diceNodesBefore.length, 4, 'should render four dice');

  const firstDie = diceNodesBefore[0];
  const secondDie = diceNodesBefore[1];
  const thirdDie = diceNodesBefore[2];
  const badge = document.querySelector('#selfZone [data-selection-badge="true"]');

  firstDie.onpointerdown({ preventDefault() {} });
  secondDie.onpointerenter();
  thirdDie.onpointerenter();

  const diceNodesAfter = Array.from(document.querySelectorAll('#selfZone .die'));
  assert.strictEqual(renderCount, 0, 'dragging across dice should not trigger full render');
  assert.strictEqual(diceNodesAfter[1], secondDie, 'second die node should stay stable during drag');
  assert.strictEqual(diceNodesAfter[2], thirdDie, 'third die node should stay stable during drag');
  assert(firstDie.classList.contains('selected'));
  assert(secondDie.classList.contains('selected'));
  assert(thirdDie.classList.contains('dragSelecting'));
  assert.strictEqual(secondDie.getAttribute('aria-pressed'), 'true');
  assert(badge.textContent.includes('已选 3 枚'), 'selection badge should update locally while dragging');

  dom.window.dispatchEvent(new dom.window.Event('pointerup'));
  assert.strictEqual(document.querySelectorAll('#selfZone .die.dragSelecting').length, 0, 'drag state should clear on pointerup');

  console.log('dice-drag-ui test passed');
  dom.window.close();
  cleanupGlobals();
}

main();
