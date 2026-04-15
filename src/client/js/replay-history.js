(function initReplayHistory(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPReplayHistory = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildReplayHistory() {
  function resolveReplaySchema() {
    if (typeof globalThis !== 'undefined' && globalThis.GPPReplaySchema) {
      return globalThis.GPPReplaySchema;
    }
    if (typeof require === 'function') {
      try {
        return require('./replay-schema');
      } catch {}
    }
    return null;
  }

  const replaySchema = resolveReplaySchema();
  const REPLAY_VERSION = replaySchema && replaySchema.REPLAY_VERSION
    ? replaySchema.REPLAY_VERSION
    : 'ReplayV1';
  const STORAGE_KEY = replaySchema && replaySchema.REPLAY_HISTORY_STORAGE_KEY
    ? replaySchema.REPLAY_HISTORY_STORAGE_KEY
    : 'gpp_replay_history_v1';
  const MAX_ENTRIES = replaySchema && Number.isInteger(replaySchema.REPLAY_HISTORY_LIMIT)
    ? replaySchema.REPLAY_HISTORY_LIMIT
    : 10;
  const REPLAY_ERROR_CODES = Object.freeze({
    INVALID_REPLAY_PAYLOAD: replaySchema && replaySchema.REPLAY_ERROR_CODES && replaySchema.REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD
      ? replaySchema.REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD
      : 'INVALID_REPLAY_PAYLOAD',
    UNSUPPORTED_REPLAY_VERSION: replaySchema && replaySchema.REPLAY_ERROR_CODES && replaySchema.REPLAY_ERROR_CODES.UNSUPPORTED_REPLAY_VERSION
      ? replaySchema.REPLAY_ERROR_CODES.UNSUPPORTED_REPLAY_VERSION
      : 'UNSUPPORTED_REPLAY_VERSION',
    INVALID_REPLAY_ENTRY: 'INVALID_REPLAY_ENTRY',
  });

  let lastLoadErrors = [];

  function getStorage(overrideStorage) {
    if (overrideStorage) return overrideStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }

  function safeParse(jsonText, fallbackValue) {
    if (typeof jsonText !== 'string' || !jsonText) return fallbackValue;
    try {
      return JSON.parse(jsonText);
    } catch {
      return fallbackValue;
    }
  }

  function safeClone(value, fallbackValue) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallbackValue;
    }
  }

  function formatPlayerLabel(player) {
    if (!player) return '-';
    const name = player.name || player.playerId || 'Unknown';
    const characterId = player.characterId || 'unknown_character';
    return `${name}(${characterId})`;
  }

  function getReplayId(replay) {
    if (!replay || typeof replay !== 'object') return '';
    if (typeof replay.replayId === 'string' && replay.replayId.trim()) return replay.replayId.trim();
    const roomCode = replay.roomMeta && replay.roomMeta.roomCode ? replay.roomMeta.roomCode : 'room';
    const startedAt = replay.roomMeta && replay.roomMeta.startedAt ? replay.roomMeta.startedAt : 0;
    const seed = replay.seed || '';
    const p0 = replay.playersLoadout && replay.playersLoadout[0] ? replay.playersLoadout[0].playerId || 'P0' : 'P0';
    const p1 = replay.playersLoadout && replay.playersLoadout[1] ? replay.playersLoadout[1].playerId || 'P1' : 'P1';
    return `replay:${roomCode}:${startedAt}:${seed}:${p0}:${p1}`;
  }

  function buildReplaySummary(replay) {
    const players = Array.isArray(replay && replay.playersLoadout) ? replay.playersLoadout : [];
    const winnerId = replay && replay.result ? replay.result.winnerPlayerId : null;
    const winner = players.find((player) => player && player.playerId === winnerId) || null;
    return {
      roomCode: replay && replay.roomMeta ? replay.roomMeta.roomCode || '' : '',
      startedAt: replay && replay.roomMeta ? replay.roomMeta.startedAt || 0 : 0,
      endedAt: replay && replay.result ? replay.result.endedAt || 0 : 0,
      players: players.slice(0, 2).map(formatPlayerLabel),
      winner: winner ? (winner.name || winner.playerId) : 'Unknown',
      rounds: replay && replay.result ? replay.result.rounds || 0 : 0,
      actionCount: Array.isArray(replay && replay.actions) ? replay.actions.length : 0,
    };
  }

  function fallbackMigrateReplay(version, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        ok: false,
        errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD,
        errorMessage: 'Invalid replay payload.',
      };
    }
    const versionText = typeof version === 'string' ? version.trim() : '';
    const payloadVersion = typeof payload.version === 'string' ? payload.version.trim() : '';
    const effectiveVersion = versionText || payloadVersion || REPLAY_VERSION;
    if (effectiveVersion !== REPLAY_VERSION) {
      return {
        ok: false,
        errorCode: REPLAY_ERROR_CODES.UNSUPPORTED_REPLAY_VERSION,
        errorMessage: `Unsupported replay version: ${effectiveVersion}`,
      };
    }
    const replay = safeClone(payload, null);
    if (!replay || typeof replay !== 'object') {
      return {
        ok: false,
        errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD,
        errorMessage: 'Invalid replay payload.',
      };
    }
    replay.version = REPLAY_VERSION;
    return {
      ok: true,
      fromVersion: versionText || payloadVersion || '(missing)',
      toVersion: REPLAY_VERSION,
      replay,
    };
  }

  function migrateReplay(version, payload) {
    if (replaySchema && typeof replaySchema.migrateReplay === 'function') {
      return replaySchema.migrateReplay(version, payload);
    }
    return fallbackMigrateReplay(version, payload);
  }

  function validateReplay(replay) {
    const version = replay && typeof replay.version === 'string' ? replay.version : '';
    const migrated = migrateReplay(version, replay);
    if (!migrated || migrated.ok !== true) {
      return {
        ok: false,
        errorCode: migrated && migrated.errorCode ? migrated.errorCode : REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD,
        errorMessage: migrated && migrated.errorMessage ? migrated.errorMessage : 'Invalid replay payload.',
      };
    }
    const normalizedReplay = migrated.replay;
    const replayId = getReplayId(normalizedReplay);
    if (!replayId) {
      return {
        ok: false,
        errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD,
        errorMessage: 'Replay id is missing.',
      };
    }
    return {
      ok: true,
      replay: normalizedReplay,
      replayId,
      fromVersion: migrated.fromVersion || '(unknown)',
      toVersion: migrated.toVersion || REPLAY_VERSION,
    };
  }

  function normalizeEntry(raw, index = -1) {
    if (!raw || typeof raw !== 'object') {
      return {
        entry: null,
        error: {
          index,
          replayId: '',
          errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_ENTRY,
          errorMessage: 'Invalid replay history entry.',
        },
      };
    }

    const validation = validateReplay(raw.replay);
    if (!validation.ok) {
      return {
        entry: null,
        error: {
          index,
          replayId: raw && raw.replay && typeof raw.replay.replayId === 'string' ? raw.replay.replayId : '',
          errorCode: validation.errorCode,
          errorMessage: validation.errorMessage,
        },
      };
    }

    const replay = validation.replay;
    const replayId = validation.replayId;
    const savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now();
    return {
      entry: {
        replayId,
        savedAt,
        summary: raw.summary && typeof raw.summary === 'object' ? raw.summary : buildReplaySummary(replay),
        replay,
      },
      error: null,
    };
  }

  function sortAndTrim(entries) {
    const sorted = entries
      .filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt);
    if (sorted.length <= MAX_ENTRIES) return sorted;
    return sorted.slice(0, MAX_ENTRIES);
  }

  function loadHistory(overrideStorage) {
    const storage = getStorage(overrideStorage);
    lastLoadErrors = [];
    if (!storage) return [];
    const parsed = safeParse(storage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(parsed)) {
      lastLoadErrors = [{
        index: -1,
        replayId: '',
        errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_ENTRY,
        errorMessage: 'Replay history payload is not an array.',
      }];
      return [];
    }
    const next = [];
    const errors = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const normalized = normalizeEntry(parsed[i], i);
      if (normalized.entry) next.push(normalized.entry);
      else if (normalized.error) errors.push(normalized.error);
    }
    lastLoadErrors = errors;
    return sortAndTrim(next);
  }

  function saveHistory(entries, overrideStorage) {
    const storage = getStorage(overrideStorage);
    if (!storage) return;
    const clean = [];
    const source = Array.isArray(entries) ? entries : [];
    for (let i = 0; i < source.length; i += 1) {
      const normalized = normalizeEntry(source[i], i);
      if (normalized.entry) clean.push(normalized.entry);
    }
    const sorted = sortAndTrim(clean);
    storage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  }

  function getLastLoadErrors() {
    return lastLoadErrors.map((error) => ({
      index: error.index,
      replayId: error.replayId,
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
    }));
  }

  function upsertReplay(replay, options = {}) {
    const validation = validateReplay(replay);
    if (!validation.ok) return null;
    const normalizedReplay = validation.replay;
    const replayId = validation.replayId;
    if (!replayId) return null;
    const storage = getStorage(options.storage);
    const current = loadHistory(storage);
    const savedAt = Number.isFinite(options.savedAt) ? options.savedAt : Date.now();
    const entry = {
      replayId,
      savedAt,
      summary: buildReplaySummary(normalizedReplay),
      replay: normalizedReplay,
    };
    const next = [entry].concat(current.filter((item) => item.replayId !== replayId));
    saveHistory(next, storage);
    return entry;
  }

  function removeReplayById(replayId, overrideStorage) {
    if (!replayId) return;
    const storage = getStorage(overrideStorage);
    const current = loadHistory(storage);
    const next = current.filter((entry) => entry.replayId !== replayId);
    saveHistory(next, storage);
  }

  function clearHistory(overrideStorage) {
    const storage = getStorage(overrideStorage);
    if (!storage) return;
    storage.removeItem(STORAGE_KEY);
    lastLoadErrors = [];
  }

  return Object.freeze({
    STORAGE_KEY,
    MAX_ENTRIES,
    REPLAY_ERROR_CODES,
    getReplayId,
    buildReplaySummary,
    migrateReplay,
    validateReplay,
    loadHistory,
    saveHistory,
    upsertReplay,
    removeReplayById,
    clearHistory,
    getLastLoadErrors,
  });
});
