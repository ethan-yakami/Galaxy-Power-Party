const assert = require('assert');

const messageRouter = require('../../src/client/js/connection-message-router');

function main() {
  const events = [];
  const route = messageRouter.createMessageRouter({
    welcome(message, context) {
      events.push({
        kind: 'welcome',
        playerId: message.playerId,
        token: context && context.token,
      });
      return true;
    },
    noop() {
      events.push({ kind: 'noop' });
      return false;
    },
  }, {
    onUnknown(message) {
      events.push({
        kind: 'unknown',
        type: message && message.type ? message.type : '',
      });
      return false;
    },
  });

  assert.strictEqual(route({ type: 'welcome', playerId: 'P1' }, { token: 7 }), true);
  assert.strictEqual(route({ type: 'noop' }, null), false);
  assert.strictEqual(route({ type: 'room_state' }, null), false);
  assert.strictEqual(route(null, null), false);
  assert.strictEqual(route('x', null), false);

  assert.deepStrictEqual(events, [
    { kind: 'welcome', playerId: 'P1', token: 7 },
    { kind: 'noop' },
    { kind: 'unknown', type: 'room_state' },
  ]);

  console.log('connection-message-router tests passed');
}

main();
