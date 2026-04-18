const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { once } = require('events');

const { startServer } = require('../../src/server/app/bootstrap');
const packageMeta = require('../../package.json');

async function fetchJson(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    json: await response.json(),
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    text: await response.text(),
  };
}

async function run() {
  const rootDir = path.resolve(__dirname, '../..');
  const buildClientDir = path.join(rootDir, 'build', 'client');
  const backupDir = path.join(rootDir, 'tmp', 'build-client-production-test-backup');
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GPP_ACCESS_TOKEN_SECRET: process.env.GPP_ACCESS_TOKEN_SECRET,
    GPP_REFRESH_TOKEN_SECRET: process.env.GPP_REFRESH_TOKEN_SECRET,
    GPP_ADMIN_TOKEN: process.env.GPP_ADMIN_TOKEN,
    GPP_APP_VERSION: process.env.GPP_APP_VERSION,
  };

  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://gpp:test@127.0.0.1:5432/gpp_test';
  process.env.GPP_ACCESS_TOKEN_SECRET = process.env.GPP_ACCESS_TOKEN_SECRET || '12345678901234567890123456789012';
  process.env.GPP_REFRESH_TOKEN_SECRET = process.env.GPP_REFRESH_TOKEN_SECRET || 'abcdefghijklmnopqrstuvwxyz123456';
  process.env.GPP_ADMIN_TOKEN = process.env.GPP_ADMIN_TOKEN || 'test-admin-token';
  process.env.GPP_APP_VERSION = packageMeta.version;

  let runtime = null;
  try {
    runtime = startServer({ port: 0, host: '127.0.0.1' });
    await once(runtime.server, 'listening');
    const address = runtime.server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const indexResponse = await fetchText(`${baseUrl}/`);
    assert.strictEqual(indexResponse.status, 200);
    assert(indexResponse.text.includes('/assets/'));
    assert(!indexResponse.text.includes('app/launcher-entry.js'));

    const diagnosticsResponse = await fetchJson(`${baseUrl}/api/frontend-diagnostics`);
    assert.strictEqual(diagnosticsResponse.status, 200);
    assert.strictEqual(diagnosticsResponse.json.frontend.ok, true);
    assert.strictEqual(diagnosticsResponse.json.frontend.servedMode, 'build-client');

    const versionResponse = await fetchJson(`${baseUrl}/api/version`);
    assert.strictEqual(versionResponse.status, 200);
    assert.strictEqual(versionResponse.json.app.version, packageMeta.version);
    assert.strictEqual(versionResponse.json.frontend.servedMode, 'build-client');

    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
    runtime = null;

    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.renameSync(buildClientDir, backupDir);

    assert.throws(
      () => startServer({ port: 0, host: '127.0.0.1' }),
      /Production frontend build is missing or incomplete/,
    );

    fs.renameSync(backupDir, buildClientDir);
    console.log('production-frontend-runtime test passed');
  } finally {
    if (runtime) {
      await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
    }
    if (fs.existsSync(backupDir) && !fs.existsSync(buildClientDir)) {
      fs.renameSync(backupDir, buildClientDir);
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
