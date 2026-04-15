const { send } = require('../../services/rooms');

const ERROR_CODES = Object.freeze({
  INVALID_JSON: 'INVALID_JSON',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_SELECTION: 'INVALID_SELECTION',
  BATTLE_NOT_ACTOR: 'BATTLE_NOT_ACTOR',
  BATTLE_STALE_TURN: 'BATTLE_STALE_TURN',
  BATTLE_INVALID_ACTION: 'BATTLE_INVALID_ACTION',
  BATTLE_ACTION_CONSUMED: 'BATTLE_ACTION_CONSUMED',
  BATTLE_PROTOCOL_DEPRECATED: 'BATTLE_PROTOCOL_DEPRECATED',
  SESSION_RESUME_FAILED: 'SESSION_RESUME_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const DEFAULT_ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.INVALID_JSON]: 'Invalid message format.',
  [ERROR_CODES.INVALID_PAYLOAD]: 'Invalid message payload.',
  [ERROR_CODES.UNKNOWN_TYPE]: 'Unknown message type.',
  [ERROR_CODES.ROOM_NOT_FOUND]: 'Room not found.',
  [ERROR_CODES.NOT_IN_ROOM]: 'You are not currently in a room.',
  [ERROR_CODES.NOT_YOUR_TURN]: 'It is not your turn.',
  [ERROR_CODES.INVALID_SELECTION]: 'Invalid selection.',
  [ERROR_CODES.BATTLE_NOT_ACTOR]: 'Only the current actor can submit this battle action.',
  [ERROR_CODES.BATTLE_STALE_TURN]: 'The submitted turnId is stale.',
  [ERROR_CODES.BATTLE_INVALID_ACTION]: 'The submitted actionId is invalid for this turn.',
  [ERROR_CODES.BATTLE_ACTION_CONSUMED]: 'This battle action turn has already been consumed.',
  [ERROR_CODES.BATTLE_PROTOCOL_DEPRECATED]: 'Legacy battle protocol is deprecated. Please submit action tickets.',
  [ERROR_CODES.SESSION_RESUME_FAILED]: 'Session resume failed.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error.',
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeMeta(meta) {
  if (!isPlainObject(meta)) return undefined;
  const output = {};
  if (typeof meta.requestId === 'string' && meta.requestId.trim()) {
    output.requestId = meta.requestId.trim();
  }
  if (typeof meta.protocolVersion === 'string' && meta.protocolVersion.trim()) {
    output.protocolVersion = meta.protocolVersion.trim();
  }
  if (Object.keys(output).length === 0) return undefined;
  return output;
}

function buildErrorPayload(code, message, options = {}) {
  const safeCode = typeof code === 'string' && code ? code : ERROR_CODES.INTERNAL_ERROR;
  const safeMessage = message || DEFAULT_ERROR_MESSAGES[safeCode] || DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR;
  const payload = {
    type: 'error',
    code: safeCode,
    message: safeMessage,
  };

  const safeMeta = sanitizeMeta(options.meta);
  if (safeMeta) {
    payload.meta = safeMeta;
  }
  return payload;
}

function sendError(ws, code, message, options = {}) {
  send(ws, buildErrorPayload(code, message, options));
}

module.exports = {
  ERROR_CODES,
  DEFAULT_ERROR_MESSAGES,
  buildErrorPayload,
  sendError,
  sanitizeMeta,
};
