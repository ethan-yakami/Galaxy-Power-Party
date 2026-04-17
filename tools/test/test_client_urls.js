const assert = require('assert');

const urls = require('../../src/client/js/url-utils');

function main() {
  const rootLocation = {
    origin: 'http://localhost:3000',
    pathname: '/battle.html',
    protocol: 'http:',
    host: 'localhost:3000',
  };
  const nestedLocation = {
    origin: 'https://example.com',
    pathname: '/gpp/battle.html',
    protocol: 'https:',
    host: 'example.com',
  };

  assert.strictEqual(urls.getBasePath(rootLocation), '/');
  assert.strictEqual(urls.getBasePath(nestedLocation), '/gpp/');
  assert.strictEqual(urls.toPath('battle.html?mode=ai', nestedLocation), '/gpp/battle.html?mode=ai');
  assert.strictEqual(urls.toApi('public-rooms?t=1', nestedLocation), '/gpp/api/public-rooms?t=1');
  assert.strictEqual(urls.toAsset('shared/replay-schema.js', nestedLocation), '/gpp/shared/replay-schema.js');
  assert.strictEqual(urls.toWsUrl(nestedLocation, 'wss:'), 'wss://example.com/gpp/');

  global.__GPP_ENDPOINTS__ = {
    apiOrigin: 'https://api.example.com/base',
    wsOrigin: 'https://rt.example.com/ws',
  };
  assert.strictEqual(urls.toApi('public-rooms?t=1', nestedLocation), 'https://api.example.com/base/api/public-rooms?t=1');
  assert.strictEqual(urls.toWsUrl(nestedLocation, 'wss:'), 'wss://rt.example.com/ws');
  delete global.__GPP_ENDPOINTS__;

  console.log('client-url-utils tests passed');
}

main();
