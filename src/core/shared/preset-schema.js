(function initPresetSchema(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPPresetSchema = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPresetSchema() {
  const PRESET_VERSION = 1;
  const PRESET_TYPE = 'battle_preset';
  const DEFAULT_WEATHER_PRESET = 'default_random';
  const PRESET_ERROR_CODES = Object.freeze({
    INVALID_PRESET: 'INVALID_PRESET',
    INVALID_PRESET_CODE: 'INVALID_PRESET_CODE',
  });

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function toBase64Url(text) {
    const encoded = typeof Buffer !== 'undefined'
      ? Buffer.from(text, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(text)));
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(text) {
    const normalized = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const value = normalized + padding;
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
    return decodeURIComponent(escape(atob(value)));
  }

  function normalizePlayer(item) {
    const player = isPlainObject(item) ? item : {};
    return {
      characterId: typeof player.characterId === 'string' ? player.characterId.trim() : '',
      auroraDiceId: typeof player.auroraDiceId === 'string' ? player.auroraDiceId.trim() : '',
    };
  }

  function normalizePreset(payload) {
    if (!isPlainObject(payload)) {
      return {
        ok: false,
        errorCode: PRESET_ERROR_CODES.INVALID_PRESET,
        errorMessage: 'Preset payload must be an object.',
      };
    }

    const players = Array.isArray(payload.players) ? payload.players.slice(0, 2).map(normalizePlayer) : [];
    while (players.length < 2) players.push(normalizePlayer({}));

    const preset = {
      v: PRESET_VERSION,
      type: PRESET_TYPE,
      name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 60) : '',
      players,
      rules: {
        weatherPreset: DEFAULT_WEATHER_PRESET,
      },
    };

    if (isPlainObject(payload.rules) && typeof payload.rules.weatherPreset === 'string' && payload.rules.weatherPreset.trim()) {
      preset.rules.weatherPreset = payload.rules.weatherPreset.trim();
    }

    return { ok: true, preset };
  }

  function encodePreset(payload) {
    const normalized = normalizePreset(payload);
    if (!normalized.ok) return normalized;
    try {
      return {
        ok: true,
        preset: normalized.preset,
        code: toBase64Url(JSON.stringify(normalized.preset)),
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: PRESET_ERROR_CODES.INVALID_PRESET,
        errorMessage: error && error.message ? error.message : 'Preset encode failed.',
      };
    }
  }

  function decodePreset(code) {
    const raw = typeof code === 'string' ? code.trim() : '';
    if (!raw) {
      return {
        ok: false,
        errorCode: PRESET_ERROR_CODES.INVALID_PRESET_CODE,
        errorMessage: 'Preset code is empty.',
      };
    }

    try {
      const decoded = JSON.parse(fromBase64Url(raw));
      return normalizePreset(decoded);
    } catch (error) {
      return {
        ok: false,
        errorCode: PRESET_ERROR_CODES.INVALID_PRESET_CODE,
        errorMessage: error && error.message ? error.message : 'Preset code decode failed.',
      };
    }
  }

  return Object.freeze({
    PRESET_VERSION,
    PRESET_TYPE,
    DEFAULT_WEATHER_PRESET,
    PRESET_ERROR_CODES,
    normalizePreset,
    encodePreset,
    decodePreset,
  });
});
