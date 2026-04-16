const { parseArgs, writeJson, fetchJson } = require('./cli_utils');

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const baseUrl = typeof args['base-url'] === 'string' ? args['base-url'].replace(/\/+$/, '') : 'http://127.0.0.1:3000';
  const roomCode = typeof args.room === 'string' ? args.room.trim() : '';
  const target = roomCode ? `${baseUrl}/api/debug/rooms/${encodeURIComponent(roomCode)}` : `${baseUrl}/api/debug/rooms`;

  try {
    const response = await fetchJson(target);
    if (response.status >= 400 || !response.body || response.body.ok === false) {
      return {
        exitCode: 3,
        payload: {
          ok: false,
          code: 'ROOM_DEBUG_FAILED',
          message: 'Debug room request failed.',
          url: target,
          status: response.status,
          body: response.body,
        },
      };
    }
    return {
      exitCode: 0,
      payload: {
        ok: true,
        url: target,
        status: response.status,
        result: response.body,
      },
    };
  } catch (error) {
    return {
      exitCode: 3,
      payload: {
        ok: false,
        code: 'ROOM_DEBUG_REQUEST_ERROR',
        message: 'Could not fetch room diagnostics.',
        url: target,
        detail: error && error.message ? error.message : String(error),
      },
    };
  }
}

if (require.main === module) {
  runCli().then((result) => {
    writeJson(result.payload);
    process.exit(result.exitCode);
  });
}

module.exports = {
  runCli,
};
