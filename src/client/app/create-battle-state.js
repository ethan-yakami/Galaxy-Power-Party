/**
 * @param {{
 *   launchIntent: Record<string, unknown> | null,
 *   launchIntentError: string,
 * }} options
 */
export function createBattleState(options) {
  return {
    me: null,
    room: null,
    selectedDice: new Set(),
    characters: {},
    auroraDice: [],
    lastProcessedEffectId: 0,
    animationChain: Promise.resolve(),
    pendingAction: null,
    battleActions: null,
    ui: {
      scene: 'home',
      logDrawerOpen: false,
      launchIntent: options.launchIntent || null,
      launchIntentBootstrapped: true,
      launchIntentConsumed: false,
      launchIntentError: options.launchIntentError || '',
      pendingCharacterId: null,
      pendingAuroraDiceId: null,
      pendingDirty: false,
      loadoutSubmitting: false,
      submittedLoadout: null,
      confirmHint: '',
      connection: {
        status: 'idle',
        detail: '',
        error: '',
      },
      socketToken: 0,
      welcomeReceived: false,
      roomAckPending: false,
      resumePending: false,
      reconnectToken: '',
      autoReplayExportRequested: false,
      suppressNextClose: false,
      reconnectDelay: 1000,
    },
  };
}
