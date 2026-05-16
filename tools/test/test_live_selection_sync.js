const assert = require('assert');
const { once } = require('events');
const WebSocket = require('ws');

const { startServer } = require('../../src/server/app/bootstrap');
const { CharacterRegistry, AuroraRegistry, allowsNoAurora } = require('../../src/server/services/registry');

class MessageQueue {
  constructor(ws) {
    this.messages = [];
    this.waiters = [];
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      this.messages.push(message);
      this.flush();
    });
  }

  flush() {
    for (let i = 0; i < this.waiters.length; i += 1) {
      const waiter = this.waiters[i];
      const index = this.messages.findIndex((message) => message.type === waiter.type);
      if (index < 0) continue;
      const [message] = this.messages.splice(index, 1);
      this.waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      i -= 1;
    }
  }

  next(type, timeoutMs = 10000) {
    const index = this.messages.findIndex((message) => message.type === type);
    if (index >= 0) {
      const [message] = this.messages.splice(index, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        type,
        resolve,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error(`timeout waiting for ws message: ${type}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async none(type, timeoutMs = 150) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    assert.strictEqual(
      this.messages.some((message) => message.type === type),
      false,
      `did not expect queued message: ${type}`,
    );
  }

  discard(type) {
    this.messages = this.messages.filter((message) => message.type !== type);
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const queue = new MessageQueue(ws);
  await once(ws, 'open');
  const welcome = await queue.next('welcome');
  return { ws, queue, playerId: welcome.playerId };
}

async function chooseLoadout(client, character, aurora) {
  client.ws.send(JSON.stringify({
    type: 'choose_character',
    payload: { characterId: character.id },
  }));
  await client.queue.next('room_state');
  if (!allowsNoAurora(character)) {
    client.ws.send(JSON.stringify({
      type: 'choose_aurora_die',
      payload: { auroraDiceId: aurora.id },
    }));
  }
}

function findAction(actions, kind) {
  return (Array.isArray(actions) ? actions : []).find((action) => action && action.kind === kind) || null;
}

async function run() {
  const character = Object.values(CharacterRegistry).find((item) => !allowsNoAurora(item))
    || Object.values(CharacterRegistry)[0];
  const aurora = Object.values(AuroraRegistry)[0];
  assert.ok(character);
  assert.ok(aurora);

  const runtime = startServer({ port: 0, host: '127.0.0.1' });
  await once(runtime.server, 'listening');
  const address = runtime.server.address();
  const wsUrl = `ws://127.0.0.1:${address.port}/`;

  const clients = [];
  try {
    const p1 = await connect(wsUrl);
    const p2 = await connect(wsUrl);
    clients.push(p1, p2);

    p1.ws.send(JSON.stringify({ type: 'create_room', payload: { name: 'P1' } }));
    const createdRoom = await p1.queue.next('room_state');
    const roomCode = createdRoom.room.code;

    p2.ws.send(JSON.stringify({ type: 'join_room', payload: { name: 'P2', code: roomCode } }));
    await p1.queue.next('room_state');
    await p2.queue.next('room_state');

    await chooseLoadout(p1, character, aurora);
    await chooseLoadout(p2, character, aurora);

    const p1InitialActions = await p1.queue.next('battle_actions');
    const p2InitialActions = await p2.queue.next('battle_actions');
    assert.strictEqual(p1InitialActions.actorId, p2InitialActions.actorId);
    const actor = p1InitialActions.actorId === p1.playerId ? p1 : p2;
    const observer = actor === p1 ? p2 : p1;
    const rollAction = findAction(p1InitialActions.actions, 'roll_attack');
    assert.ok(rollAction, 'initial turn should expose a roll attack action');

    actor.ws.send(JSON.stringify({
      type: 'submit_battle_action',
      payload: {
        turnId: p1InitialActions.turnId,
        actionId: rollAction.actionId,
      },
    }));
    await actor.queue.next('room_state');
    await observer.queue.next('room_state');
    await actor.queue.next('battle_actions');
    await observer.queue.next('battle_actions');
    actor.queue.discard('room_state');
    observer.queue.discard('room_state');

    actor.ws.send(JSON.stringify({
      type: 'update_live_selection',
      payload: {
        indices: [0],
        clientSentAt: 1234,
        requestId: 'live-test-1',
      },
    }));

    const liveUpdate = await observer.queue.next('live_selection_updated');
    assert.strictEqual(liveUpdate.roomCode, roomCode);
    assert.strictEqual(liveUpdate.playerId, actor.playerId);
    assert.strictEqual(liveUpdate.lane, 'attack');
    assert.deepStrictEqual(liveUpdate.indices, [0]);
    assert.strictEqual(liveUpdate.requestId, 'live-test-1');
    assert.ok(liveUpdate.timing.serverReceivedAt);
    assert.ok(liveUpdate.timing.serverSentAt);
    await observer.queue.none('room_state');

    console.log('test_live_selection_sync passed');
  } finally {
    clients.forEach((client) => client.ws.close());
    runtime.wss.close();
    runtime.server.close();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
