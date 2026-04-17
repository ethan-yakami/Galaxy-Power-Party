const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { once } = require('events');

const { startServer } = require('../../src/server/app/bootstrap');

async function fetchText(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  };
}

async function run() {
  const rootDir = path.resolve(__dirname, '../..');
  const buildClientDir = path.join(rootDir, 'build', 'client');
  const assetsDir = path.join(buildClientDir, 'assets');
  const htmlPath = path.join(buildClientDir, 'cache-test.html');
  const assetPath = path.join(assetsDir, 'app.12345678.js');
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GPP_ACCESS_TOKEN_SECRET: process.env.GPP_ACCESS_TOKEN_SECRET,
    GPP_REFRESH_TOKEN_SECRET: process.env.GPP_REFRESH_TOKEN_SECRET,
    GPP_ADMIN_TOKEN: process.env.GPP_ADMIN_TOKEN,
  };

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(htmlPath, '<!doctype html><html><body>cache test</body></html>', 'utf8');
  fs.writeFileSync(assetPath, 'console.log("cache test asset");', 'utf8');

  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://gpp:test@127.0.0.1:5432/gpp_test';
  process.env.GPP_ACCESS_TOKEN_SECRET = process.env.GPP_ACCESS_TOKEN_SECRET || '12345678901234567890123456789012';
  process.env.GPP_REFRESH_TOKEN_SECRET = process.env.GPP_REFRESH_TOKEN_SECRET || 'abcdefghijklmnopqrstuvwxyz123456';
  process.env.GPP_ADMIN_TOKEN = process.env.GPP_ADMIN_TOKEN || 'test-admin-token';
  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const htmlResponse = await fetchText(`${baseUrl}/cache-test.html`);
    assert.strictEqual(htmlResponse.status, 200);
    assert.strictEqual(htmlResponse.headers.get('cache-control'), 'no-cache');
    assert(htmlResponse.text.includes('cache test'));

    const assetResponse = await fetchText(`${baseUrl}/assets/app.12345678.js`);
    assert.strictEqual(assetResponse.status, 200);
    assert.strictEqual(assetResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert(assetResponse.text.includes('cache test asset'));

    console.log('static-asset-headers test passed');
  } finally {
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    try {
      fs.unlinkSync(htmlPath);
    } catch {
      // Ignore temporary file cleanup races.
    }
    try {
      fs.unlinkSync(assetPath);
    } catch {
      // Ignore temporary file cleanup races.
    }
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
