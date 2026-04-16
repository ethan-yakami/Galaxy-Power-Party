const path = require('path');

const { parseArgs, writeJson, readJsonFile } = require('./cli_utils');
const replaySchema = require('../../src/core/shared/replay-schema');

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const filePath = typeof args.file === 'string' ? path.resolve(args.file) : '';

  if (!filePath) {
    return {
      exitCode: 2,
      payload: {
        ok: false,
        code: 'REPLAY_FILE_REQUIRED',
        message: 'Pass --file <path-to-replay.json>.',
      },
    };
  }

  let payload = null;
  try {
    payload = readJsonFile(filePath);
  } catch (error) {
    return {
      exitCode: 2,
      payload: {
        ok: false,
        code: 'REPLAY_READ_FAILED',
        message: 'Failed to read replay file.',
        file: filePath,
        detail: error && error.message ? error.message : String(error),
      },
    };
  }

  const migrated = replaySchema.migrateReplay(payload && payload.version, payload);
  if (!migrated.ok) {
    return {
      exitCode: 3,
      payload: {
        ok: false,
        code: migrated.errorCode || 'REPLAY_INVALID',
        message: migrated.errorMessage || 'Replay inspection failed.',
        file: filePath,
      },
    };
  }

  return {
    exitCode: 0,
    payload: {
      ok: true,
      file: filePath,
      fromVersion: migrated.fromVersion,
      toVersion: migrated.toVersion,
      summary: {
        replayId: migrated.replay.replayId,
        players: Array.isArray(migrated.replay.playersLoadout) ? migrated.replay.playersLoadout.map((item) => ({
          playerId: item.playerId,
          name: item.name,
          characterId: item.characterId,
          auroraDiceId: item.auroraDiceId,
        })) : [],
        actionCount: Array.isArray(migrated.replay.actions) ? migrated.replay.actions.length : 0,
        snapshotCount: Array.isArray(migrated.replay.snapshots) ? migrated.replay.snapshots.length : 0,
        result: migrated.replay.result,
      },
      migratedReplay: args.full ? migrated.replay : undefined,
    },
  };
}

if (require.main === module) {
  const result = runCli();
  writeJson(result.payload);
  process.exit(result.exitCode);
}

module.exports = {
  runCli,
};
