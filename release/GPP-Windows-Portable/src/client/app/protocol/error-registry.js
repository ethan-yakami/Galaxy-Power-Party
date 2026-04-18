export const ERROR_REGISTRY = Object.freeze({
  INVALID_JSON: { code: 'INVALID_JSON', category: 'protocol', severity: 'warn' },
  INVALID_PAYLOAD: { code: 'INVALID_PAYLOAD', category: 'protocol', severity: 'warn' },
  UNKNOWN_TYPE: { code: 'UNKNOWN_TYPE', category: 'protocol', severity: 'warn' },
  ROOM_NOT_FOUND: { code: 'ROOM_NOT_FOUND', category: 'user', severity: 'warn' },
  ROOM_RESERVED: { code: 'ROOM_RESERVED', category: 'user', severity: 'warn' },
  NOT_IN_ROOM: { code: 'NOT_IN_ROOM', category: 'user', severity: 'warn' },
  NOT_YOUR_TURN: { code: 'NOT_YOUR_TURN', category: 'user', severity: 'warn' },
  INVALID_SELECTION: { code: 'INVALID_SELECTION', category: 'user', severity: 'warn' },
  BATTLE_NOT_ACTOR: { code: 'BATTLE_NOT_ACTOR', category: 'battle', severity: 'warn' },
  BATTLE_STALE_TURN: { code: 'BATTLE_STALE_TURN', category: 'battle', severity: 'warn' },
  BATTLE_INVALID_ACTION: { code: 'BATTLE_INVALID_ACTION', category: 'battle', severity: 'warn' },
  BATTLE_ACTION_CONSUMED: { code: 'BATTLE_ACTION_CONSUMED', category: 'battle', severity: 'warn' },
  BATTLE_PROTOCOL_DEPRECATED: { code: 'BATTLE_PROTOCOL_DEPRECATED', category: 'protocol', severity: 'warn' },
  SESSION_RESUME_FAILED: { code: 'SESSION_RESUME_FAILED', category: 'resume', severity: 'warn' },
  UNSUPPORTED_PROTOCOL_VERSION: { code: 'UNSUPPORTED_PROTOCOL_VERSION', category: 'protocol', severity: 'error' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', category: 'internal', severity: 'error' },
});

/**
 * @param {string | undefined} code
 */
export function describeErrorCode(code) {
  if (!code || !ERROR_REGISTRY[code]) {
    return ERROR_REGISTRY.INTERNAL_ERROR;
  }
  return ERROR_REGISTRY[code];
}
