(function initProtocolErrorRegistry(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPProtocolErrors = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildProtocolErrorRegistry() {
  const ERROR_REGISTRY = Object.freeze({
    INVALID_JSON: {
      code: 'INVALID_JSON',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: 'Invalid message format.',
    },
    INVALID_PAYLOAD: {
      code: 'INVALID_PAYLOAD',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: 'Invalid message payload.',
    },
    UNKNOWN_TYPE: {
      code: 'UNKNOWN_TYPE',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: 'Unknown message type.',
    },
    ROOM_NOT_FOUND: {
      code: 'ROOM_NOT_FOUND',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'Room not found.',
    },
    ROOM_FULL: {
      code: 'ROOM_FULL',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'Room is full.',
    },
    ROOM_IN_GAME: {
      code: 'ROOM_IN_GAME',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'Room is already in game.',
    },
    ROOM_ENDED: {
      code: 'ROOM_ENDED',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'Room has ended.',
    },
    NOT_IN_ROOM: {
      code: 'NOT_IN_ROOM',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'You are not currently in a room.',
    },
    NOT_YOUR_TURN: {
      code: 'NOT_YOUR_TURN',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'It is not your turn.',
    },
    INVALID_SELECTION: {
      code: 'INVALID_SELECTION',
      category: 'user',
      severity: 'warn',
      defaultMessage: 'Invalid selection.',
    },
    BATTLE_NOT_ACTOR: {
      code: 'BATTLE_NOT_ACTOR',
      category: 'battle',
      severity: 'warn',
      defaultMessage: 'Only the current actor can submit this battle action.',
    },
    BATTLE_STALE_TURN: {
      code: 'BATTLE_STALE_TURN',
      category: 'battle',
      severity: 'warn',
      defaultMessage: 'The submitted turnId is stale.',
    },
    BATTLE_INVALID_ACTION: {
      code: 'BATTLE_INVALID_ACTION',
      category: 'battle',
      severity: 'warn',
      defaultMessage: 'The submitted actionId is invalid for this turn.',
    },
    BATTLE_ACTION_CONSUMED: {
      code: 'BATTLE_ACTION_CONSUMED',
      category: 'battle',
      severity: 'warn',
      defaultMessage: 'This battle action turn has already been consumed.',
    },
    BATTLE_PROTOCOL_DEPRECATED: {
      code: 'BATTLE_PROTOCOL_DEPRECATED',
      category: 'protocol',
      severity: 'warn',
      defaultMessage: 'Legacy battle protocol is deprecated. Please submit action tickets.',
    },
    SESSION_RESUME_FAILED: {
      code: 'SESSION_RESUME_FAILED',
      category: 'resume',
      severity: 'warn',
      defaultMessage: 'Session resume failed.',
    },
    RATE_LIMITED: {
      code: 'RATE_LIMITED',
      category: 'security',
      severity: 'warn',
      defaultMessage: 'Too many requests. Please retry later.',
    },
    UNSUPPORTED_PROTOCOL_VERSION: {
      code: 'UNSUPPORTED_PROTOCOL_VERSION',
      category: 'protocol',
      severity: 'error',
      defaultMessage: 'Unsupported protocol version.',
    },
    INTERNAL_ERROR: {
      code: 'INTERNAL_ERROR',
      category: 'internal',
      severity: 'error',
      defaultMessage: 'Internal server error.',
    },
  });

  function getErrorDescriptor(code) {
    if (typeof code === 'string' && ERROR_REGISTRY[code]) {
      return ERROR_REGISTRY[code];
    }
    return ERROR_REGISTRY.INTERNAL_ERROR;
  }

  return Object.freeze({
    ERROR_REGISTRY,
    getErrorDescriptor,
    listErrorDescriptors() {
      return Object.values(ERROR_REGISTRY);
    },
  });
});
