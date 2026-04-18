const path = require('path');

const { parseArgs, writeJson } = require('./cli_utils');
const manifest = require('../../src/core/shared/generated/protocol-manifest.json');
const { listErrorDescriptors } = require('../../src/core/shared/protocol/error-registry');

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const messageType = typeof args.type === 'string' ? args.type.trim() : '';

  if (args.errors) {
    return {
      exitCode: 0,
      payload: {
        ok: true,
        source: 'error-registry',
        errors: listErrorDescriptors(),
      },
    };
  }

  if (messageType) {
    const descriptor = (manifest.messages || []).find((item) => item && item.type === messageType);
    if (!descriptor) {
      return {
        exitCode: 2,
        payload: {
          ok: false,
          code: 'PROTOCOL_TYPE_NOT_FOUND',
          message: `Unknown protocol message type: ${messageType}`,
          knownTypes: (manifest.messages || []).map((item) => item.type),
        },
      };
    }
    return {
      exitCode: 0,
      payload: {
        ok: true,
        type: descriptor.type,
        descriptor,
      },
    };
  }

  return {
    exitCode: 0,
    payload: {
      ok: true,
      source: path.relative(process.cwd(), path.join(__dirname, '../../src/core/shared/generated/protocol-manifest.json')),
      version: manifest.version,
      messageCount: (manifest.messages || []).length,
      messages: (manifest.messages || []).map((item) => ({
        type: item.type,
        direction: item.direction,
        protoMessage: item.protoMessage,
        source: item.source,
      })),
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
