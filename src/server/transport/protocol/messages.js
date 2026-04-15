const { ERROR_CODES, sanitizeMeta } = require('./errors');

const PROTOCOL_VERSION = '2';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isIntegerArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function buildTopLevelPayload(source) {
  const payload = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (key === 'type' || key === 'payload' || key === 'meta') continue;
    payload[key] = value;
  }
  return payload;
}

function validateRequiredStringField(payload, fieldName) {
  if (typeof payload[fieldName] !== 'string') {
    return `${fieldName} must be a string.`;
  }
  return '';
}

const PAYLOAD_VALIDATORS = Object.freeze({
  create_room(payload) {
    return validateRequiredStringField(payload, 'name');
  },
  create_ai_room(payload) {
    return validateRequiredStringField(payload, 'name');
  },
  join_room(payload) {
    const nameError = validateRequiredStringField(payload, 'name');
    if (nameError) return nameError;
    if (typeof payload.code !== 'string' && typeof payload.code !== 'number') {
      return 'code must be a string or number.';
    }
    return '';
  },
  leave_room() {
    return '';
  },
  resume_session(payload) {
    const roomCodeError = validateRequiredStringField(payload, 'roomCode');
    if (roomCodeError) return roomCodeError;
    return validateRequiredStringField(payload, 'reconnectToken');
  },
  play_again() {
    return '';
  },
  disband_room() {
    return '';
  },
  choose_character(payload) {
    return validateRequiredStringField(payload, 'characterId');
  },
  choose_aurora_die(payload) {
    return validateRequiredStringField(payload, 'auroraDiceId');
  },
  create_custom_character(payload) {
    if (!isPlainObject(payload.variant)) {
      return 'variant must be an object.';
    }
    return '';
  },
  list_custom_characters() {
    return '';
  },
  update_custom_character(payload) {
    if (!isPlainObject(payload.variant)) {
      return 'variant must be an object.';
    }
    return '';
  },
  delete_custom_character(payload) {
    return validateRequiredStringField(payload, 'characterId');
  },
  toggle_custom_character(payload) {
    const characterIdError = validateRequiredStringField(payload, 'characterId');
    if (characterIdError) return characterIdError;
    if (typeof payload.enabled !== 'boolean') {
      return 'enabled must be a boolean.';
    }
    return '';
  },
  roll_attack() {
    return '';
  },
  use_aurora_die() {
    return '';
  },
  reroll_attack(payload) {
    if (!isIntegerArray(payload.indices)) {
      return 'indices must be an integer array.';
    }
    return '';
  },
  update_live_selection(payload) {
    if (!isIntegerArray(payload.indices)) {
      return 'indices must be an integer array.';
    }
    return '';
  },
  confirm_attack_selection(payload) {
    if (!isIntegerArray(payload.indices)) {
      return 'indices must be an integer array.';
    }
    return '';
  },
  roll_defense() {
    return '';
  },
  confirm_defense_selection(payload) {
    if (!isIntegerArray(payload.indices)) {
      return 'indices must be an integer array.';
    }
    return '';
  },
  export_replay(payload) {
    if (payload.requestSource !== undefined && typeof payload.requestSource !== 'string') {
      return 'requestSource must be a string.';
    }
    return '';
  },
  create_resume_room(payload) {
    if (payload.snapshotIndex !== undefined && !Number.isInteger(payload.snapshotIndex)) {
      return 'snapshotIndex must be an integer.';
    }
    if (payload.replay !== undefined && !isPlainObject(payload.replay)) {
      return 'replay must be an object.';
    }
    if (payload.mode !== undefined && typeof payload.mode !== 'string') {
      return 'mode must be a string.';
    }
    return '';
  },
  apply_preset(payload) {
    if (payload.preset !== undefined && !isPlainObject(payload.preset)) {
      return 'preset must be an object.';
    }
    if (payload.presetCode !== undefined && typeof payload.presetCode !== 'string') {
      return 'presetCode must be a string.';
    }
    if (payload.useSuggestedPreset !== undefined && typeof payload.useSuggestedPreset !== 'boolean') {
      return 'useSuggestedPreset must be a boolean.';
    }
    return '';
  },
  preview_preset(payload) {
    if (payload.preset !== undefined && !isPlainObject(payload.preset)) {
      return 'preset must be an object.';
    }
    if (payload.presetCode !== undefined && typeof payload.presetCode !== 'string') {
      return 'presetCode must be a string.';
    }
    return '';
  },
});

function validatePayload(type, payload) {
  const validator = PAYLOAD_VALIDATORS[type];
  if (typeof validator !== 'function') {
    return {
      ok: false,
      errorCode: ERROR_CODES.UNKNOWN_TYPE,
      errorMessage: 'Unknown message type.',
    };
  }

  const validationError = validator(payload);
  if (validationError) {
    return {
      ok: false,
      errorCode: ERROR_CODES.INVALID_PAYLOAD,
      errorMessage: validationError,
    };
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
  PAYLOAD_VALIDATORS,
  normalizeIncomingMessage,
};
