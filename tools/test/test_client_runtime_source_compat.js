const assert = require('assert');
const { once } = require('events');

const { startServer } = require('../../src/server/app/bootstrap');

async function fetchText(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    text: await response.text(),
  };
}

async function run() {
  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const launcherEntry = await fetchText(`${baseUrl}/app/launcher-entry.js`);
    assert.strictEqual(launcherEntry.status, 200);
    assert(!launcherEntry.text.includes('?raw'), 'launcher-entry.js should not depend on ?raw');
    assert(launcherEntry.text.includes('runtime-source-loader'), 'launcher-entry.js should use runtime-source-loader');

    const battleRuntime = await fetchText(`${baseUrl}/app/load-battle-runtime.js`);
    assert.strictEqual(battleRuntime.status, 200);
    assert(!battleRuntime.text.includes('?raw'), 'load-battle-runtime.js should not depend on ?raw');
    assert(battleRuntime.text.includes('loadRuntimeSources'), 'battle runtime should fetch runtime sources at runtime');

    const legacyBattleRuntime = await fetchText(`${baseUrl}/app/load-legacy-battle-runtime.js`);
    assert.strictEqual(legacyBattleRuntime.status, 200);
    assert(
      legacyBattleRuntime.text.includes('./load-battle-runtime.js'),
      'load-legacy-battle-runtime.js should stay as a thin compatibility wrapper'
    );

    const runtimeLoader = await fetchText(`${baseUrl}/app/runtime-source-loader.js`);
    assert.strictEqual(runtimeLoader.status, 200);
    assert(runtimeLoader.text.includes('fetchRuntimeSource'));

    const urlUtils = await fetchText(`${baseUrl}/js/url-utils.js`);
    assert.strictEqual(urlUtils.status, 200);
    assert(urlUtils.text.includes('GPPUrls'));

    const launcherScript = await fetchText(`${baseUrl}/js/launcher.js`);
    assert.strictEqual(launcherScript.status, 200);
    assert(launcherScript.text.includes('openBattlePage'));

    const protocolErrors = await fetchText(`${baseUrl}/shared/protocol/error-registry.js`);
    assert.strictEqual(protocolErrors.status, 200);
    assert(protocolErrors.text.includes('ROOM_RESERVED'));

    console.log('client-runtime-source-compat test passed');
  } finally {
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
