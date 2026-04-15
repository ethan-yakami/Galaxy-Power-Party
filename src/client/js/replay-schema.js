(function initReplaySchema(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.GPPReplaySchema = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildReplaySchema() {
  const REPLAY_VERSION_V1 = 'ReplayV1';
  const REPLAY_VERSION_V2 = 'ReplayV2';
  const REPLAY_VERSION = REPLAY_VERSION_V2;
  const SUPPORTED_REPLAY_VERSIONS = Object.freeze([REPLAY_VERSION_V1, REPLAY_VERSION_V2]);
  const REPLAY_EXPORT_REQUEST_TYPE = 'export_replay';
  const REPLAY_EXPORT_RESPONSE_TYPE = 'replay_export';
  const REPLAY_FILE_PREFIX = 'gpp-replay';
  const REPLAY_HISTORY_STORAGE_KEY = 'gpp_replay_history_v2';
  const REPLAY_HISTORY_LIMIT = 10;
  const REPLAY_ERROR_CODES = Object.freeze({
    INVALID_REPLAY_PAYLOAD: 'INVALID_REPLAY_PAYLOAD',
    UNSUPPORTED_REPLAY_VERSION: 'UNSUPPORTED_REPLAY_VERSION',
  });

  const REPLAY_FIELDS = Object.freeze({
    replayId: 'replayId',
    version: 'version',
    engineMode: 'engineMode',
    seed: 'seed',
    roomMeta: 'roomMeta',
    playersLoadout: 'playersLoadout',
    actions: 'actions',
    stepDetails: 'stepDetails',
    snapshots: 'snapshots',
    result: 'result',
  });

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneDeep(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function normalizeNumber(value, fallbackValue = 0) {
    return Number.isFinite(value) ? value : fallbackValue;
  }

  function normalizeNullableNumber(value) {
    return Number.isFinite(value) ? value : null;
  }

  function normalizeNullableString(value) {
    return typeof value === 'string' && value ? value : null;
  }

  function normalizePlayersLoadout(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => isPlainObject(item))
      .map((item) => ({
        playerId: typeof item.playerId === 'string' ? item.playerId : '',
        name: typeof item.name === 'string' ? item.name : '',
        characterId: typeof item.characterId === 'string' ? item.characterId : '',
        auroraDiceId: typeof item.auroraDiceId === 'string' ? item.auroraDiceId : '',
      }));
  }

  function normalizeActions(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => isPlainObject(item))
      .map((item, index) => ({
        step: normalizeNumber(item.step, index + 1),
        actor: typeof item.actor === 'string' ? item.actor : '',
        phaseBefore: typeof item.phaseBefore === 'string' ? item.phaseBefore : '',
        actionCode: typeof item.actionCode === 'string' ? item.actionCode : '',
        opcode: normalizeNumber(item.opcode, 0),
        actionMask: normalizeNumber(item.actionMask, 0),
        indices: Array.isArray(item.indices) ? item.indices.filter((idx) => Number.isInteger(idx)) : [],
        encodedAction: normalizeNumber(item.encodedAction, 0),
        timestamp: normalizeNumber(item.timestamp, 0),
      }));
  }

  function normalizeActionOutcome(value) {
    if (!isPlainObject(value)) {
      return {
        ok: true,
        reason: '',
        phase: '',
        status: '',
        winner: null,
        weatherChangedRound: null,
      };
    }
    return {
      ok: value.ok !== false,
      reason: typeof value.reason === 'string' ? value.reason : '',
      phase: typeof value.phase === 'string' ? value.phase : '',
      status: typeof value.status === 'string' ? value.status : '',
      winner: Number.isInteger(value.winner) ? value.winner : null,
      weatherChangedRound: normalizeNullableNumber(value.weatherChangedRound),
    };
  }

  function normalizeStepDetails(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => isPlainObject(item))
      .map((item, index) => ({
        step: normalizeNumber(item.step, index + 1),
        actionOutcome: normalizeActionOutcome(item.actionOutcome),
        logsAdded: Array.isArray(item.logsAdded) ? item.logsAdded.map((line) => String(line || '')) : [],
        effectsAdded: Array.isArray(item.effectsAdded) ? cloneDeep(item.effectsAdded) || [] : [],
        phaseBefore: typeof item.phaseBefore === 'string' ? item.phaseBefore : '',
        phaseAfter: typeof item.phaseAfter === 'string' ? item.phaseAfter : '',
        roundBefore: normalizeNumber(item.roundBefore, 0),
        roundAfter: normalizeNumber(item.roundAfter, 0),
        winnerAfter: Number.isInteger(item.winnerAfter) ? item.winnerAfter : null,
      }));
  }

  function normalizeSnapshots(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => isPlainObject(item))
      .map((item, index) => ({
        step: normalizeNumber(item.step, index),
        reason: typeof item.reason === 'string' ? item.reason : 'snapshot',
        timestamp: normalizeNumber(item.timestamp, 0),
        round: normalizeNumber(item.round, 0),
        phase: typeof item.phase === 'string' ? item.phase : '',
        status: typeof item.status === 'string' ? item.status : '',
        winnerPlayerId: normalizeNullableString(item.winnerPlayerId),
        state: item.state && typeof item.state === 'object' ? cloneDeep(item.state) : null,
        view: item.view && typeof item.view === 'object' ? cloneDeep(item.view) : null,
      }));
  }

  function normalizeResult(value) {
    const result = isPlainObject(value) ? value : {};
    return {
      winnerPlayerId: normalizeNullableString(result.winnerPlayerId),
      rounds: normalizeNumber(result.rounds, 0),
      endedReason: typeof result.endedReason === 'string' ? result.endedReason : '',
      endedAt: normalizeNullableNumber(result.endedAt),
    };
  }

  function normalizeRoomMeta(value) {
    const roomMeta = isPlainObject(value) ? value : {};
    return {
      roomCode: typeof roomMeta.roomCode === 'string' ? roomMeta.roomCode : '',
      startedAt: normalizeNumber(roomMeta.startedAt, 0),
      startingAttacker: Number.isInteger(roomMeta.startingAttacker) ? roomMeta.startingAttacker : null,
      endedAt: normalizeNullableNumber(roomMeta.endedAt),
      resumedFromReplayId: normalizeNullableString(roomMeta.resumedFromReplayId),
      resumedFromStep: normalizeNullableNumber(roomMeta.resumedFromStep),
      roomMode: typeof roomMeta.roomMode === 'string' ? roomMeta.roomMode : 'standard',
    };
  }

  function normalizeReplayBase(payload, version) {
    const replay = cloneDeep(payload) || {};
    replay.replayId = typeof replay.replayId === 'string' ? replay.replayId : '';
    replay.version = version;
    replay.engineMode = typeof replay.engineMode === 'string' ? replay.engineMode : 'pure';
    replay.seed = typeof replay.seed === 'string' ? replay.seed : String(replay.seed || '');
    replay.roomMeta = normalizeRoomMeta(replay.roomMeta);
    replay.playersLoadout = normalizePlayersLoadout(replay.playersLoadout);
    replay.actions = normalizeActions(replay.actions);
    replay.snapshots = normalizeSnapshots(replay.snapshots);
    replay.result = normalizeResult(replay.result);
    return replay;
  }

  function normalizeReplayV2(payload) {
    const replay = normalizeReplayBase(payload, REPLAY_VERSION_V2);
    replay.stepDetails = normalizeStepDetails(replay.stepDetails);
    return replay;
  }

  function deriveStepDetailsFromV1(replay) {
    const actions = Array.isArray(replay.actions) ? replay.actions : [];
    const snapshots = Array.isArray(replay.snapshots) ? replay.snapshots : [];
    return actions.map((action, index) => {
      const snapshot = snapshots.find((item) => item && item.step === action.step) || null;
      return {
        step: normalizeNumber(action.step, index + 1),
        actionOutcome: {
          ok: true,
          reason: '',
          phase: snapshot && typeof snapshot.phase === 'string' ? snapshot.phase : '',
          status: snapshot && typeof snapshot.status === 'string' ? snapshot.status : '',
          winner: null,
          weatherChangedRound: null,
        },
        logsAdded: snapshot && snapshot.view && Array.isArray(snapshot.view.logTail)
          ? snapshot.view.logTail.map((line) => String(line || ''))
          : [],
        effectsAdded: [],
        phaseBefore: typeof action.phaseBefore === 'string' ? action.phaseBefore : '',
        phaseAfter: snapshot && typeof snapshot.phase === 'string' ? snapshot.phase : '',
        roundBefore: index > 0 && snapshots[index - 1] ? normalizeNumber(snapshots[index - 1].round, 0) : 0,
        roundAfter: snapshot ? normalizeNumber(snapshot.round, 0) : 0,
        winnerAfter: null,
      };
    });
  }

  function normalizeReplayV1(payload) {
    const replay = normalizeReplayBase(payload, REPLAY_VERSION_V2);
    replay.stepDetails = deriveStepDetailsFromV1(replay);
    return replay;
  }

  function migrateReplay(version, payload) {
    if (!isPlainObject(payload)) {
      return {
        ok: false,
        errorCode: REPLAY_ERROR_CODES.INVALID_REPLAY_PAYLOAD,
        errorMessage: 'Invalid replay payload.',
      };
    }

    const payloadVersion = typeof payload.version === 'string' ? payload.version.trim() : '';
    const inputVersion = typeof version === 'string' ? version.trim() : '';
    const effectiveVersion = inputVersion || payloadVersion || REPLAY_VERSION_V1;

    if (effectiveVersion === REPLAY_VERSION_V2) {
      return {
        ok: true,
        fromVersion: effectiveVersion,
        toVersion: REPLAY_VERSION_V2,
        replay: normalizeReplayV2(payload),
      };
    }

    if (effectiveVersion === REPLAY_VERSION_V1 || !effectiveVersion) {
      return {
        ok: true,
        fromVersion: effectiveVersion || '(missing)',
        toVersion: REPLAY_VERSION_V2,
        replay: normalizeReplayV1(payload),
      };
    }

    return {
      ok: false,
      errorCode: REPLAY_ERROR_CODES.UNSUPPORTED_REPLAY_VERSION,
      errorMessage: `Unsupported replay version: ${effectiveVersion}`,
    };
  }

  return Object.freeze({
    REPLAY_VERSION_V1,
    REPLAY_VERSION_V2,
    REPLAY_VERSION,
    SUPPORTED_REPLAY_VERSIONS,
    REPLAY_ERROR_CODES,
    REPLAY_EXPORT_REQUEST_TYPE,
    REPLAY_EXPORT_RESPONSE_TYPE,
    REPLAY_FILE_PREFIX,
    REPLAY_HISTORY_STORAGE_KEY,
    REPLAY_HISTORY_LIMIT,
    REPLAY_FIELDS,
    migrateReplay,
  });
});
