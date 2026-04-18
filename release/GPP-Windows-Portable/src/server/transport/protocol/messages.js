const { ERROR_CODES, sanitizeMeta } = require('./errors');
const {
  PROTOCOL_VERSION,
  isSupportedProtocolVersion,
} = require('../../../core/shared/protocol/versioning');
const protocolManifest = require('../../../core/shared/generated/protocol-manifest.json');

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isIntegerArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function buildTopLevelPayload(source) {
  const payload = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (key === 'type' || key === 'payload' || key === 'meta') continue;
    payload[key] = value;
  }
  return payload;
}

function validateFieldType(field, value) {
  switch (field.type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer_array':
      return isIntegerArray(value);
    case 'string_array':
      return isStringArray(value);
    case 'string_or_number':
      return typeof value === 'string' || typeof value === 'number';
    case 'object':
      return isPlainObject(value);
    case 'object_array':
      return Array.isArray(value) && value.every((item) => isPlainObject(item));
    default:
      return true;
  }
}

const MESSAGE_DESCRIPTORS = Object.freeze(Object.fromEntries(
  (protocolManifest.messages || [])
    .filter((descriptor) => descriptor && descriptor.direction === 'client_to_server')
    .map((descriptor) => [descriptor.type, descriptor])
));

const CUSTOM_PAYLOAD_VALIDATORS = Object.freeze({
  submit_battle_action(payload) {
    if (!Number.isInteger(payload.turnId) || payload.turnId <= 0) {
      return 'turnId must be a positive integer.';
    }
    if (typeof payload.actionId !== 'string' || !payload.actionId.trim()) {
      return 'actionId must be a non-empty string.';
    }
    return '';
  },
});

function validatePayload(type, payload) {
  const descriptor = MESSAGE_DESCRIPTORS[type];
  if (!descriptor) {
    return {
      ok: false,
      errorCode: ERROR_CODES.UNKNOWN_TYPE,
      errorMessage: 'Unknown message type.',
    };
  }

  for (const field of descriptor.fields || []) {
    const value = payload[field.name];
    if (value === undefined) {
      if (field.required !== false) {
        return {
          ok: false,
          errorCode: ERROR_CODES.INVALID_PAYLOAD,
          errorMessage: `${field.name} is required.`,
        };
      }
      continue;
    }
    if (!validateFieldType(field, value)) {
      return {
        ok: false,
        errorCode: ERROR_CODES.INVALID_PAYLOAD,
        errorMessage: `${field.name} must be a valid ${field.type}.`,
      };
    }
  }

  const customValidator = CUSTOM_PAYLOAD_VALIDATORS[type];
  if (typeof customValidator === 'function') {
    const validationError = customValidator(payload);
    if (validationError) {
      return {
        ok: false,
        errorCode: ERROR_CODES.INVALID_PAYLOAD,
        errorMessage: validationError,
      };
    }
  }

  return { ok: true };
}

function normalizeIncomingMessage(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      errorCode: ERROR_CODES.INVALID_JSON,
      errorMessage: 'Invalid message format.',
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      errorCode: ERROR_CODES.INVALID_JSON,
      errorMessage: 'Invalid message format.',
    };
  }

  const parsedMeta = sanitizeMeta(parsed.meta);
  const rawType = typeof parsed.type === 'string' ? parsed.type.trim() : '';
  if (!rawType) {
    return {
      ok: false,
      errorCode: ERROR_CODES.UNKNOWN_TYPE,
      errorMessage: 'Unknown message type.',
      meta: parsedMeta,
    };
  }

  const topLevelPayload = buildTopLevelPayload(parsed);
  const normalizedPayload = { ...topLevelPayload };
  if (parsed.payload !== undefined) {
    if (!isPlainObject(parsed.payload)) {
      return {
        ok: false,
        errorCode: ERROR_CODES.INVALID_JSON,
        errorMessage: 'payload must be an object.',
        meta: parsedMeta,
      };
    }
    Object.assign(normalizedPayload, parsed.payload);
  }

  const validation = validatePayload(rawType, normalizedPayload);
  if (!validation.ok) {
    return {
      ok: false,
      errorCode: validation.errorCode,
      errorMessage: validation.errorMessage,
      meta: parsedMeta,
    };
  }

  const meta = parsedMeta || {};
  if (!meta.protocolVersion) {
    meta.protocolVersion = PROTOCOL_VERSION;
  }
  if (!isSupportedProtocolVersion(meta.protocolVersion)) {
    return {
      ok: false,
      errorCode: ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION,
      errorMessage: `Unsupported protocol version: ${meta.protocolVersion}`,
      meta,
    };
  }

  return {
    ok: true,
    envelope: {
      type: rawType,
      payload: normalizedPayload,
      meta,
    },
    legacyMessage: {
      type: rawType,
      ...normalizedPayload,
      meta,
    },
  };
}

module.exports = {
  PROTOCOL_VERSION,
  PAYLOAD_VALIDATORS: MESSAGE_DESCRIPTORS,
  normalizeIncomingMessage,
};
