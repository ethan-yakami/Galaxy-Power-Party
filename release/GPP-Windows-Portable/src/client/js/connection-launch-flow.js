(function initConnectionLaunchFlow(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPConnectionLaunchFlow = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildConnectionLaunchFlow() {
  function cloneIntent(intent) {
    return intent && typeof intent === 'object'
      ? JSON.parse(JSON.stringify(intent))
      : null;
  }

  function ensureLaunchFlow(uiState) {
    const ui = uiState && typeof uiState === 'object' ? uiState : {};
    if (!ui.launchFlow || typeof ui.launchFlow !== 'object') {
      ui.launchFlow = {
        originalIntent: null,
        roomRequestSent: false,
        roomAckReceived: false,
        lastError: '',
        retryCount: 0,
      };
    }
    return ui.launchFlow;
  }

  function rememberLaunchIntent(uiState, intent) {
    const ui = uiState && typeof uiState === 'object' ? uiState : {};
    const flow = ensureLaunchFlow(ui);
    const nextIntent = cloneIntent(intent);
    flow.originalIntent = nextIntent;
    flow.roomRequestSent = false;
    flow.roomAckReceived = false;
    flow.lastError = '';
    flow.retryCount = 0;
    ui.launchIntent = nextIntent;
    ui.launchIntentConsumed = false;
    return flow;
  }

  function resetLaunchRequest(uiState, errorText) {
    const ui = uiState && typeof uiState === 'object' ? uiState : {};
    const flow = ensureLaunchFlow(ui);
    if (flow.roomRequestSent || errorText) {
      flow.retryCount += 1;
    }
    flow.roomRequestSent = false;
    flow.roomAckReceived = false;
    flow.lastError = errorText || flow.lastError || '';
    return flow;
  }

  function markLaunchRequestSent(uiState) {
    const flow = ensureLaunchFlow(uiState);
    flow.roomRequestSent = true;
    flow.roomAckReceived = false;
    flow.lastError = '';
    return flow;
  }

  function markLaunchAckReceived(uiState) {
    const flow = ensureLaunchFlow(uiState);
    flow.roomRequestSent = false;
    flow.roomAckReceived = true;
    flow.lastError = '';
    return flow;
  }

  function clearLaunchFlow(uiState) {
    const ui = uiState && typeof uiState === 'object' ? uiState : {};
    const flow = ensureLaunchFlow(ui);
    flow.originalIntent = null;
    flow.roomRequestSent = false;
    flow.roomAckReceived = false;
    flow.lastError = '';
    flow.retryCount = 0;
    ui.launchIntent = null;
    ui.launchIntentConsumed = false;
    return flow;
  }

  return Object.freeze({
    cloneIntent,
    ensureLaunchFlow,
    rememberLaunchIntent,
    resetLaunchRequest,
    markLaunchRequestSent,
    markLaunchAckReceived,
    clearLaunchFlow,
  });
});
