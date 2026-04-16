const { send } = require('../../services/rooms');
const { ERROR_REGISTRY, getErrorDescriptor } = require('../../../core/shared/protocol/error-registry');

const ERROR_CODES = Object.freeze(Object.fromEntries(
  Object.keys(ERROR_REGISTRY).map((code) => [code, code])
));

const DEFAULT_ERROR_MESSAGES = Object.freeze(Object.fromEntries(
  Object.values(ERROR_REGISTRY).map((descriptor) => [descriptor.code, descriptor.defaultMessage])
));

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
  const descriptor = getErrorDescriptor(code);
  const safeCode = descriptor.code;
  const safeMessage = message || descriptor.defaultMessage || DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR;
  const payload = {
    type: 'error',
    code: safeCode,
    message: safeMessage,
    severity: descriptor.severity,
    category: descriptor.category,
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
