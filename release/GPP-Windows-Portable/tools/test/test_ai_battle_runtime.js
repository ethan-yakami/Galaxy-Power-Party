const assert = require('assert');
const WebSocket = require('ws');

const { startServer } = require('../../src/server/app/bootstrap');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chooseFirstIndices(dice, count) {
  const out = [];
  const limit = Math.min(count, Array.isArray(dice) ? dice.length : 0);
  for (let i = 0; i < limit; i += 1) out.push(i);
  return out;
}

async function main() {
  process.env.PORT = '3132';
  process.env.HOST = '127.0.0.1';

  const runtime = startServer();
  let ws = null;
  try {
    ws = new WebSocket('ws://127.0.0.1:3132');
    let myId = null;
    let sawAiAttackSelect = false;
    let resolved = false;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('runtime AI battle test timed out'));
      }, 15000);

      ws.on('error', reject);
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'welcome') {
          myId = msg.playerId;
          ws.send(JSON.stringify({ type: 'create_ai_room', name: '玩家59' }));
          return;
        }

        if (msg.type !== 'room_state') return;
        const room = msg.room || {};
        const game = room.game || null;
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

        if (game.phase === 'attack_roll' && game.attackerId === myId) {
          ws.send(JSON.stringify({ type: 'roll_attack' }));
          return;
        }

        if (game.phase === 'attack_reroll_or_select' && game.attackerId === myId) {
          const need = game.attackLevel && game.attackLevel[myId] ? game.attackLevel[myId] : 3;
          ws.send(JSON.stringify({ type: 'confirm_attack_selection', indices: chooseFirstIndices(game.attackDice, need) }));
          return;
        }

        if (game.phase === 'defense_roll' && game.defenderId === myId) {
          if (sawAiAttackSelect && game.round >= 2) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
            return;
          }
          ws.send(JSON.stringify({ type: 'roll_defense' }));
          return;
        }

        if (game.phase === 'defense_select' && game.defenderId === myId) {
          const need = game.defenseLevel && game.defenseLevel[myId] ? game.defenseLevel[myId] : 3;
          ws.send(JSON.stringify({ type: 'confirm_defense_selection', indices: chooseFirstIndices(game.defenseDice, need) }));
        }
      });
    });

    assert.strictEqual(resolved, true, 'AI attack phase should auto-resolve into defense_roll');
    console.log('ai-battle-runtime test passed');
  } finally {
    if (ws) {
      try {
        ws.removeAllListeners();
        ws.terminate();
      } catch {}
    }
    await new Promise((resolve) => runtime.wss.close(() => runtime.server.close(resolve)));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
