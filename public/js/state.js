window.GPP = window.GPP || {};

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

const state = {
  me: null,
  room: null,
  selectedDice: new Set(),
  characters: {},
  auroraDice: [],
  lastProcessedEffectId: 0,
  animationChain: Promise.resolve(),
  pendingAction: null,
  ui: {
    scene: 'home',
    logDrawerOpen: false,
    launchIntent: null,
    launchIntentConsumed: false,
    launchIntentError: '',
    pendingCharacterId: null,
    pendingAuroraDiceId: null,
    pendingDirty: false,
    confirmHint: '',
    connection: {
      status: 'idle',
      detail: '',
      error: '',
    },
    socketToken: 0,
    welcomeReceived: false,
    roomAckPending: false,
  },
};

const dom = {
  docBtn: document.getElementById('docBtn'),
  backToLauncherBtn: document.getElementById('backToLauncherBtn'),
  backToLauncherInlineBtn: document.getElementById('backToLauncherInlineBtn'),
  launchHint: document.getElementById('launchHint'),
  connectionStatusBadge: document.getElementById('connectionStatusBadge'),
  connectionDetail: document.getElementById('connectionDetail'),
  connectionError: document.getElementById('connectionError'),
  reconnectBtn: document.getElementById('reconnectBtn'),
  retryIntentBtn: document.getElementById('retryIntentBtn'),
  myIdEl: document.getElementById('myId'),
  nameInput: document.getElementById('nameInput'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  createBtn: document.getElementById('createBtn'),
  aiBtn: document.getElementById('aiBtn'),
  joinBtn: document.getElementById('joinBtn'),
  leaveBtn: document.getElementById('leaveBtn'),
  messageEl: document.getElementById('message'),
  msgPanel: document.getElementById('msgPanel'),
  connectionPanel: document.getElementById('connectionPanel'),
  roomPanel: document.getElementById('roomPanel'),
  roomCodeEl: document.getElementById('roomCode'),
  playersList: document.getElementById('playersList'),
  lobbyArea: document.getElementById('lobbyArea'),
  lobbyControls: document.getElementById('lobbyControls'),
  selectionSummary: document.getElementById('selectionSummary'),
  confirmLoadoutBtn: document.getElementById('confirmLoadoutBtn'),
  confirmHint: document.getElementById('confirmHint'),
  gameArea: document.getElementById('gameArea'),
  roundInfo: document.getElementById('roundInfo'),
  turnInfo: document.getElementById('turnInfo'),
  enemyZone: document.getElementById('enemyZone'),
  selfZone: document.getElementById('selfZone'),
  actionRail: document.getElementById('actionRail'),
  battleCenterScore: document.getElementById('battleCenterScore'),
  logBox: document.getElementById('logBox'),
  logDrawer: document.getElementById('logDrawer'),
  logToggleBtn: document.getElementById('logToggleBtn'),
  characterButtons: document.getElementById('characterButtons'),
  auroraButtons: document.getElementById('auroraButtons'),
  lobbyHint: document.getElementById('lobbyHint'),
};

function send(type, payload) {
  if (GPP.ws && GPP.ws.readyState === WebSocket.OPEN) {
    GPP.ws.send(JSON.stringify({ type, ...payload }));
  }
}

function sendWithFeedback(type, label, payload) {
  state.pendingAction = label;
  GPP.render();
  send(type, payload);
}

function setMessage(msg) {
  if (dom.messageEl) {
    dom.messageEl.textContent = msg;
  }
}

Object.assign(window.GPP, {
  wsProtocol,
  state,
  dom,
  ws: null,
  reconnectDelay: 1000,
  MAX_RECONNECT_DELAY: 15000,
  send,
  sendWithFeedback,
  setMessage,
  render: function() {},
});
