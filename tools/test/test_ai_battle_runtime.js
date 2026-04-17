const assert = require('assert');
const WebSocket = require('ws');

const { startServer } = require('../../src/server/app/bootstrap');

function chooseFirstIndices(dice, count) {
  const out = [];
  const limit = Math.min(count, Array.isArray(dice) ? dice.length : 0);
  for (let i = 0; i < limit; i += 1) out.push(i);
  return out;
}

function indicesToMask(indices) {
  if (!Array.isArray(indices)) return -1;
  let mask = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const idx = indices[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= 6) return -1;
    const bit = 1 << idx;
    if (mask & bit) return -1;
    mask |= bit;
  }
  return mask;
}

function findAction(ticket, kind, mask) {
  if (!ticket || !Array.isArray(ticket.actions)) return null;
  for (let i = 0; i < ticket.actions.length; i += 1) {
    const action = ticket.actions[i];
    if (!action || action.kind !== kind) continue;
    if (mask == null || action.mask === mask) return action;
  }
  return null;
}

async function main() {
  const port = 32000 + Math.floor(Math.random() * 2000);
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';

  const runtime = startServer();
  let ws = null;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let myId = null;
    let sawAiAttackSelect = false;
    let resolved = false;
    let currentGame = null;
    let currentTicket = null;
    let lastSubmittedTurn = 0;
    let lastObservedPhase = 'init';
    let lastObservedRound = 0;
    let lastObservedPendingActorId = null;

    function submitAction(action) {
      if (!action || !currentTicket) return;
      if (currentTicket.turnId === lastSubmittedTurn) return;
      lastSubmittedTurn = currentTicket.turnId;
      ws.send(JSON.stringify({
        type: 'submit_battle_action',
        turnId: currentTicket.turnId,
        actionId: action.actionId,
      }));
    }

    function maybePlayMyTurn() {
      if (!currentGame || !currentTicket) return;
      if (currentTicket.actorId !== myId) return;

      if (currentTicket.phase === 'attack_roll') {
        submitAction(findAction(currentTicket, 'roll_attack'));
        return;
      }

      if (currentTicket.phase === 'attack_reroll_or_select') {
        const need = currentGame.attackLevel && currentGame.attackLevel[myId] ? currentGame.attackLevel[myId] : 3;
        const indices = chooseFirstIndices(currentGame.attackDice, need);
        const mask = indicesToMask(indices);
        submitAction(findAction(currentTicket, 'confirm_attack', mask) || findAction(currentTicket, 'confirm_attack'));
        return;
      }

      if (currentTicket.phase === 'defense_roll') {
        submitAction(findAction(currentTicket, 'roll_defense'));
        return;
      }

      if (currentTicket.phase === 'defense_select') {
        const need = currentGame.defenseLevel && currentGame.defenseLevel[myId] ? currentGame.defenseLevel[myId] : 3;
        const indices = chooseFirstIndices(currentGame.defenseDice, need);
        const mask = indicesToMask(indices);
        submitAction(findAction(currentTicket, 'confirm_defense', mask) || findAction(currentTicket, 'confirm_defense'));
      }
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`runtime AI battle test timed out at round=${lastObservedRound} phase=${lastObservedPhase} pendingActor=${lastObservedPendingActorId || 'none'}`));
      }, 30000);

      ws.on('error', reject);
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'welcome') {
          myId = msg.playerId;
          ws.send(JSON.stringify({ type: 'create_ai_room', name: 'Player59' }));
          return;
        }

        if (msg.type === 'battle_actions') {
          currentTicket = msg;
          maybePlayMyTurn();
          return;
        }

        if (msg.type !== 'room_state') return;
        const room = msg.room || {};
        const game = room.game || null;
        currentGame = game;
        lastObservedPhase = game && game.phase ? game.phase : room.status || 'unknown';
        lastObservedRound = game && Number.isFinite(game.round) ? game.round : 0;
        lastObservedPendingActorId = game && game.pendingActorId ? game.pendingActorId : null;
        const me = Array.isArray(room.players) ? room.players.find((player) => player.id === myId) : null;

        if (room.status === 'lobby' && me && !me.characterId) {
          ws.send(JSON.stringify({ type: 'apply_preset', characterId: 'baie', auroraDiceId: 'legacy' }));
          return;
        }

        if (!game) return;

        if (game.round >= 2 && game.attackerId === 'AI' && game.phase === 'attack_reroll_or_select') {
          sawAiAttackSelect = true;
          assert.strictEqual(game.pendingActorId, 'AI');
          assert.strictEqual(game.pendingActionKind, 'attack_select');
          assert.strictEqual(game.isAiThinking, true);
        }

        if (
          sawAiAttackSelect
          && game.round >= 2
          && (
            (game.phase === 'defense_select' && game.defenderId === myId)
            || game.phase === 'ended'
          )
        ) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        maybePlayMyTurn();
      });
    });

    assert.strictEqual(resolved, true, 'AI attack phase should auto-resolve into the next stable phase');
    console.log('ai-battle-runtime test passed');
  } finally {
    if (ws) {
      try {
        ws.removeAllListeners();
        ws.terminate();
      } catch {
        // Ignore cleanup errors from already-closed test sockets.
      }
    }
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
