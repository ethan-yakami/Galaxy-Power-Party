const assert = require('assert');
const WebSocket = require('ws');

const createHandlers = require('../../src/server/app/handlers');
const createRoomLifecycleRoutes = require('../../src/server/transport/message-routes/room-lifecycle');
const { ERROR_CODES } = require('../../src/server/transport/protocol/errors');
const { send } = require('../../src/server/services/rooms');

function createSocket(playerId, roomCode, extra = {}) {
  const sent = [];
  return {
    playerId,
    playerRoomCode: roomCode,
    reconnectToken: `${playerId}-token`,
    readyState: WebSocket.OPEN,
    sent,
    send(raw) {
      sent.push(JSON.parse(String(raw)));
    },
    ...extra,
  };
}

function createEndedRoom(code, humanWs, otherPlayer) {
  return {
    code,
    status: 'ended',
    roomMode: 'ai',
    lastActiveAt: Date.now(),
    players: [
      {
        id: humanWs.playerId,
        name: 'Tester',
        ws: humanWs,
        isOnline: true,
        reconnectToken: humanWs.reconnectToken,
      },
      otherPlayer,
    ],
    game: {
      status: 'ended',
      phase: 'ended',
    },
  };
}

function main() {
  const rooms = new Map();
  const handlers = createHandlers(rooms, {});
  const routes = createRoomLifecycleRoutes({
    handlers,
    ERROR_CODES,
    send,
  });

  const ownerWs = createSocket('P1_owner', '9001');
  const aiWs = createSocket('AI_socket', '9001', { isAI: true });
  rooms.set('9001', createEndedRoom('9001', ownerWs, {
    id: 'AI',
    name: 'AI',
    ws: aiWs,
    isOnline: true,
    reconnectToken: 'ai_token',
  }));

  routes.disband_room.run(ownerWs);
  assert.strictEqual(rooms.has('9001'), false, 'disband_room should remove an ended room');
  assert.strictEqual(ownerWs.sent[0].type, 'left_room');
  assert.strictEqual(typeof ownerWs.sent[0].reason, 'string');
  assert.strictEqual(aiWs.sent[0].type, 'left_room');
  assert.strictEqual(typeof aiWs.sent[0].reason, 'string');

  const leaveWs = createSocket('P2_guest', '9002');
  const leaveAiWs = createSocket('AI_socket_2', '9002', { isAI: true });
  rooms.set('9002', createEndedRoom('9002', leaveWs, {
    id: 'AI_2',
    name: 'AI',
    ws: leaveAiWs,
    isOnline: true,
    reconnectToken: 'ai_token_2',
  }));

  routes.leave_room.run(leaveWs);
  assert.strictEqual(rooms.has('9002'), false, 'leave_room should remove an ended AI room after the human leaves');
  assert.strictEqual(leaveWs.sent[0].type, 'left_room');

  console.log('battle-end-room-exit test passed');
}

main();
