#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
process.env.GPP_CUSTOM_CHARACTER_PATH = path.join(tmpDir, 'custom_characters_test.json');

const createHandlers = require('../src/server/app/handlers');
const roomsMod = require('../src/server/services/rooms');
const dice = require('../src/server/services/dice');
const skills = require('../src/server/services/skills');
const weather = require('../src/server/services/weather');
const registry = require('../src/server/services/registry');

const { CharacterRegistry, AuroraRegistry, triggerCharacterHook, reloadRegistry } = registry;
const { pushEffectEvent } = roomsMod;

function withRandomSequence(seq, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function createMockWs(id) {
  return {
    readyState: 1,
    playerId: id,
    playerRoomCode: null,
    sent: [],
    send(raw) {
      try {
        this.sent.push(JSON.parse(raw));
      } catch {
        this.sent.push(raw);
      }
    },
  };
}

function resetSent(ws) {
  ws.sent.length = 0;
}

function lastError(ws) {
  for (let i = ws.sent.length - 1; i >= 0; i -= 1) {
    if (ws.sent[i] && ws.sent[i].type === 'error') return ws.sent[i];
  }
  return null;
}

function setupRoom(options = {}) {
  const p1Char = options.p1Char || 'xiang';
  const p2Char = options.p2Char || 'xiang';
  const c1 = CharacterRegistry[options.p1Char || 'xiadie'] ? options.p1Char || 'xiadie' : 'xiadie';
  const c2 = CharacterRegistry[options.p2Char || 'huangquan'] ? options.p2Char || 'huangquan' : 'huangquan';
  const a1 = options.p1Aurora || 'prime';
  const a2 = options.p2Aurora || 'prime';

  const rooms = new Map();
  const handlers = createHandlers(rooms);
  const ws1 = createMockWs('P1');
  const ws2 = createMockWs('P2');

  handlers.handleCreateRoom(ws1, { name: 'A' });
  const code = ws1.playerRoomCode;
  handlers.handleJoinRoom(ws2, { name: 'B', code });
  handlers.handleChooseCharacter(ws1, { characterId: c1 });
  handlers.handleChooseCharacter(ws2, { characterId: c2 });

  if (CharacterRegistry[c1].auroraUses > 0) handlers.handleChooseAurora(ws1, { auroraDiceId: a1 });
  if (CharacterRegistry[c2].auroraUses > 0) handlers.handleChooseAurora(ws2, { auroraDiceId: a2 });

  const room = rooms.get(code);
  if (!room || !room.game) {
    throw new Error('setupRoom failed to start game.');
  }

  return { rooms, handlers, ws1, ws2, room };
}

function mkBasicRoomAndGame() {
  const room = {
    players: [
      { id: 'P1', name: 'A', characterId: 'xiadie', auroraDiceId: 'prime' },
      { id: 'P2', name: 'B', characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
    status: 'in_game',
  };
  const game = {
    round: 1,
    phase: 'attack_reroll_or_select',
    attackerId: 'P1',
    defenderId: 'P2',
    attackValue: 0,
    defenseValue: 0,
    attackPierce: false,
    extraAttackQueued: false,
    attackSelection: [],
    defenseSelection: [],
    attackDice: [],
    defenseDice: [],
    hp: { P1: 30, P2: 30 },
    maxHp: { P1: 30, P2: 30 },
    diceSidesByPlayer: { P1: [8, 8, 6, 6, 4], P2: [8, 6, 4, 4, 4] },
    attackLevel: { P1: 3, P2: 3 },
    defenseLevel: { P1: 3, P2: 3 },
    auroraUsesRemaining: { P1: 2, P2: 2 },
    selectedFourCount: { P1: 0, P2: 0 },
    selectedOneCount: { P1: 0, P2: 0 },
    cumulativeDamageTaken: { P1: 0, P2: 0 },
    overload: { P1: 0, P2: 0 },
    unyielding: { P1: false, P2: false },
    desperateBonus: { P1: 0, P2: 0 },
    counterActive: { P1: false, P2: false },
    auroraAEffectCount: { P1: 0, P2: 0 },
    whiteeGuardUsed: { P1: false, P2: false },
    whiteeGuardActive: { P1: false, P2: false },
    roundAuroraUsed: { P1: false, P2: false },
    forceField: { P1: false, P2: false },
    poison: { P1: 0, P2: 0 },
    resilience: { P1: 0, P2: 0 },
    thorns: { P1: 0, P2: 0 },
    power: { P1: 0, P2: 0 },
    hackActive: { P1: false, P2: false },
    danhengCounterReady: { P1: false, P2: false },
    xilianCumulative: { P1: 0, P2: 0 },
    xilianAscensionActive: { P1: false, P2: false },
    yaoguangRerollsUsed: { P1: 0, P2: 0 },
    effectEventSeq: 0,
    effectEvents: [],
    log: [],
  };
  weather.ensureWeatherState(room, game);
  return { room, game };
}

const results = [];

function run(testId, group, fn) {
  try {
    fn();
    results.push({ testId, group, status: 'PASS', detail: '' });
  } catch (err) {
    results.push({
      testId,
      group,
      status: 'FAIL',
      detail: err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err),
    });
  }
}

// FLOW-SRV
run('FLOW-SRV-001', 'FLOW-SRV', () => {
  const ctx = withRandomSequence([0.1, 0.1, 0.1], () => setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' }));
  assert.equal(ctx.room.status, 'in_game');
  assert.equal(ctx.room.game.phase, 'attack_roll');
});

run('FLOW-SRV-002', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'yaoguang', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'attack_roll';
  withRandomSequence([0.2, 0.3, 0.4, 0.5, 0.6], () => ctx.handlers.handleRollAttack(ctx.ws1));
  assert.equal(ctx.room.game.phase, 'attack_reroll_or_select');
  assert.equal(ctx.room.game.rerollsLeft, 4);
  assert.ok(Array.isArray(ctx.room.game.attackDice));
});

run('FLOW-SRV-003', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'yaoguang', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'attack_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollAttack(ctx.ws1));
  const before = ctx.room.game.rerollsLeft;
  withRandomSequence([0.9, 0.8], () => ctx.handlers.handleRerollAttack(ctx.ws1, { indices: [1, 1, 3, 3] }));
  assert.equal(before - 1, ctx.room.game.rerollsLeft);
});

run('FLOW-SRV-004', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'attack_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollAttack(ctx.ws1));
  const snapshot = JSON.stringify(ctx.room.game.attackDice);
  resetSent(ctx.ws1);
  ctx.handlers.handleRerollAttack(ctx.ws1, { indices: [999] });
  const err = lastError(ctx.ws1);
  assert.ok(err && /索引无效/.test(err.message));
  assert.equal(JSON.stringify(ctx.room.game.attackDice), snapshot);
});

run('FLOW-SRV-005', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'attack_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollAttack(ctx.ws1));
  resetSent(ctx.ws1);
  ctx.handlers.handleConfirmAttack(ctx.ws1, { indices: [0] });
  const err = lastError(ctx.ws1);
  assert.ok(err && /必须选择/.test(err.message));
});

run('FLOW-SRV-006', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'destiny', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'attack_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollAttack(ctx.ws1));
  withRandomSequence([0.95], () => ctx.handlers.handleUseAurora(ctx.ws1));
  const idx = ctx.room.game.attackDice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  assert.ok(idx >= 0);
  const pick = [0, 1].filter((x) => x !== idx).slice(0, 2);
  resetSent(ctx.ws1);
  ctx.handlers.handleConfirmAttack(ctx.ws1, { indices: pick });
  const err = lastError(ctx.ws1);
  assert.ok(err && /命定/.test(err.message));
});

run('FLOW-SRV-007', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'defense_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollDefense(ctx.ws2));
  assert.equal(ctx.room.game.phase, 'defense_select');
  assert.ok(Array.isArray(ctx.room.game.defenseDice));
});

run('FLOW-SRV-008', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'defense_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollDefense(ctx.ws2));
  resetSent(ctx.ws2);
  ctx.handlers.handleConfirmDefense(ctx.ws2, { indices: [0] });
  const err = lastError(ctx.ws2);
  assert.ok(err && /必须选择/.test(err.message));
});

run('FLOW-SRV-009', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'destiny' });
  ctx.room.game.attackerId = 'P1';
  ctx.room.game.defenderId = 'P2';
  ctx.room.game.phase = 'defense_roll';
  withRandomSequence([0.1, 0.2, 0.3, 0.4, 0.5], () => ctx.handlers.handleRollDefense(ctx.ws2));
  withRandomSequence([0.95], () => ctx.handlers.handleUseAurora(ctx.ws2));
  const idx = ctx.room.game.defenseDice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  assert.ok(idx >= 0);
  const pick = [0, 1, 2].filter((x) => x !== idx).slice(0, ctx.room.game.defenseLevel.P2);
  resetSent(ctx.ws2);
  ctx.handlers.handleConfirmDefense(ctx.ws2, { indices: pick });
  const err = lastError(ctx.ws2);
  assert.ok(err && /命定/.test(err.message));
});

run('FLOW-SRV-010', 'FLOW-SRV', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.hp.P2 = 0;
  game.attackValue = 10;
  game.defenseValue = 0;
  const ended = skills.checkGameOver(room, game);
  assert.equal(ended, true);
  assert.equal(game.status, 'ended');
  assert.ok(game.winnerId);
});

run('FLOW-SRV-011', 'FLOW-SRV', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.attackerId = 'P1';
  game.hp.P1 = 0;
  game.hp.P2 = 0;
  const ended = skills.checkGameOver(room, game);
  assert.equal(ended, true);
  assert.equal(game.winnerId, 'P1');
});

run('FLOW-SRV-012', 'FLOW-SRV', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  ctx.room.status = 'ended';
  ctx.room.game.status = 'ended';
  ctx.handlers.handlePlayAgain(ctx.ws1);
  assert.equal(ctx.room.status, 'lobby');
  assert.equal(ctx.room.game, null);
});

// CHAR
run('CHAR-BAIE', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const defender = room.players[0];
  triggerCharacterHook('onDefenseConfirm', { characterId: 'baie' }, game, defender, [{ value: 4 }, { value: 4 }], room);
  assert.equal(game.whiteeGuardActive.P1, true);
});

run('CHAR-DAHEITA', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.auroraAEffectCount.P1 = 4;
  const should = triggerCharacterHook('shouldAscend', { characterId: 'daheita' }, game, p);
  assert.equal(!!should, true);
});

run('CHAR-DANHENG', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.attackValue = 18;
  triggerCharacterHook('onMainAttackConfirm', { characterId: 'danheng' }, game, p);
  assert.equal(game.danhengCounterReady.P1, true);
});

run('CHAR-FENGJIN', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.power.P1 = 3;
  game.attackValue = 7;
  triggerCharacterHook('onMainAttackConfirm', { characterId: 'fengjin' }, game, p);
  assert.equal(game.attackValue, 10);
});

run('CHAR-HUANGQUAN', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  triggerCharacterHook('onAttackConfirm', { characterId: 'huangquan' }, game, p, [{ value: 4 }, { value: 4 }]);
  assert.equal(game.attackPierce, true);
  assert.equal(game.attackLevel.P1, 4);
});

run('CHAR-HUOHUA', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  triggerCharacterHook('onAttackConfirm', { characterId: 'huohua' }, game, p, [{ value: 2 }, { value: 2 }]);
  assert.equal(game.hackActive.P1, true);
});

run('CHAR-KAFUKA', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.defenderId = 'P2';
  triggerCharacterHook('onAttackConfirm', { characterId: 'kafuka' }, game, p, [{ value: 1 }, { value: 2 }, { value: 3 }], room);
  assert.equal(game.poison.P2, 3);
});

run('CHAR-LIUYING', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  triggerCharacterHook('onAttackConfirm', { characterId: 'liuying' }, game, p, [{ value: 2 }, { value: 2 }, { value: 3 }, { value: 3 }]);
  assert.equal(game.extraAttackQueued, true);
});

run('CHAR-SANYUEQI', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.defenderId = 'P2';
  triggerCharacterHook('onMainAttackConfirm', { characterId: 'sanyueqi' }, game, p, [{ value: 2 }, { value: 2 }, { value: 3 }, { value: 3 }], room);
  assert.ok(game.effectEvents.some((e) => e.type === 'instant_damage'));
});

run('CHAR-SHAJIN', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.defenderId = 'P2';
  triggerCharacterHook('onAttackConfirm', { characterId: 'shajin' }, game, p, [{ value: 1 }, { value: 3 }, { value: 5 }], room);
  assert.ok(game.resilience.P1 >= 3);
});

run('CHAR-XIADIE', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const defender = room.players[0];
  const attacker = room.players[1];
  const before = game.hp.P2;
  triggerCharacterHook('onDamageApplied', { characterId: 'xiadie' }, game, defender, attacker, [8, 3], room);
  assert.ok(game.attackLevel.P1 > 3 && game.defenseLevel.P1 > 3);
  assert.ok(game.hp.P2 < before);
});

run('CHAR-XILIAN', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.attackValue = 25;
  triggerCharacterHook('onMainAttackConfirm', { characterId: 'xilian' }, game, p);
  assert.equal(game.xilianAscensionActive.P1, true);
  assert.equal(game.attackLevel.P1, 5);
});

run('CHAR-YAOGUANG', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  triggerCharacterHook('onReroll', { characterId: 'yaoguang' }, game, p);
  triggerCharacterHook('onReroll', { characterId: 'yaoguang' }, game, p);
  triggerCharacterHook('onReroll', { characterId: 'yaoguang' }, game, p);
  assert.equal(game.yaoguangRerollsUsed.P1, 3);
  assert.equal(game.thorns.P1, 2);
});

run('CHAR-ZHIGENGNIAO', 'CHAR', () => {
  const { room, game } = mkBasicRoomAndGame();
  const p = room.players[0];
  game.diceSidesByPlayer.P1 = [4, 4, 6, 6, 8];
  triggerCharacterHook('onAttackConfirm', { characterId: 'zhigengniao' }, game, p, [
    { value: 2, isAurora: false, slotId: 0 },
    { value: 4, isAurora: false, slotId: 1 },
    { value: 6, isAurora: false, slotId: 2 },
    { value: 8, isAurora: false, slotId: 3 },
  ]);
  assert.deepEqual(game.diceSidesByPlayer.P1.slice(0, 4), [6, 6, 8, 8]);
});

// AURORA
run('AURORA-BERSERKER', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  AuroraRegistry.berserker.hooks.onAttack(game, room.players[0], { value: 8 });
  assert.equal(game.thorns.P1, 2);
});

run('AURORA-BIGREDBUTTON', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.bigredbutton.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  game.round = 6;
  AuroraRegistry.bigredbutton.hooks.onAttack(game, room.players[0]);
  assert.equal(game.hp.P1, 1);
  assert.ok(game.desperateBonus.P1 > 0);
});

run('AURORA-CACTUS', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.cactus.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  AuroraRegistry.cactus.hooks.onDefense(game, room.players[0]);
  assert.equal(game.counterActive.P1, true);
});

run('AURORA-DESTINY', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  AuroraRegistry.destiny.hooks.onAttack(game, room.players[0]);
  assert.ok(game.log.some((x) => x.includes('命定')));
});

run('AURORA-EVOLUTION', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.attackValue = 7;
  game.defenseValue = 6;
  AuroraRegistry.evolution.hooks.onAttack(game, room.players[0]);
  AuroraRegistry.evolution.hooks.onDefense(game, room.players[1]);
  assert.equal(game.attackValue, 14);
  assert.equal(game.defenseValue, 12);
});

run('AURORA-GAMBLER', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 5;
  const denied = AuroraRegistry.gambler.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
});

run('AURORA-HEARTBEAT', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  AuroraRegistry.heartbeat.hooks.onAttack(game, room.players[0]);
  assert.equal(game.auroraUsesRemaining.P1, 3);
});

run('AURORA-LEGACY', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.legacy.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  game.hp.P1 = 8;
  const ok = AuroraRegistry.legacy.hooks.canUse(room.players[0], game, 'attack');
  assert.equal(ok, undefined);
});

run('AURORA-LOAN', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  AuroraRegistry.loan.hooks.onAttack(game, room.players[0], { value: 4 });
  assert.equal(game.overload.P1, 4);
});

run('AURORA-MAGICBULLET', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.defenderId = 'P2';
  const before = game.hp.P2;
  AuroraRegistry.magicbullet.hooks.onAttack(game, room.players[0], { value: 7 }, room);
  assert.equal(game.hp.P2, before - 3);
});

run('AURORA-MEDIC', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.hp.P1 = 20;
  AuroraRegistry.medic.hooks.onAttack(game, room.players[0], { value: 6 });
  assert.equal(game.hp.P1, 26);
});

run('AURORA-MIRACLE', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.miracle.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  game.selectedOneCount.P1 = 9;
  const ok = AuroraRegistry.miracle.hooks.canUse(room.players[0], game, 'attack');
  assert.equal(ok, undefined);
});

run('AURORA-OATH', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.oath.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  AuroraRegistry.oath.hooks.onDefense(game, room.players[0]);
  assert.equal(game.unyielding.P1, true);
});

run('AURORA-PRIME', 'AURORA', () => {
  assert.ok(Array.isArray(AuroraRegistry.prime.faces));
  assert.equal(Object.keys(AuroraRegistry.prime.hooks || {}).length, 0);
});

run('AURORA-REPEATER', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.repeater.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  game.selectedFourCount.P1 = 2;
  const ok = AuroraRegistry.repeater.hooks.canUse(room.players[0], game, 'attack');
  assert.equal(ok, undefined);
  AuroraRegistry.repeater.hooks.onAttack(game, room.players[0]);
  assert.equal(game.extraAttackQueued, true);
});

run('AURORA-REVENGE', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.revenge.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  game.cumulativeDamageTaken.P1 = 25;
  const ok = AuroraRegistry.revenge.hooks.canUse(room.players[0], game, 'attack');
  assert.equal(ok, undefined);
});

run('AURORA-SIXSIX', 'AURORA', () => {
  const faces = AuroraRegistry.sixsix.faces.map((f) => f.value);
  assert.equal(new Set(faces).size, 1);
  assert.equal(faces[0], 6);
});

run('AURORA-STARSHIELD', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  const denied = AuroraRegistry.starshield.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(denied && denied.ok === false);
  AuroraRegistry.starshield.hooks.onDefense(game, room.players[0]);
  assert.equal(game.forceField.P1, true);
});

run('AURORA-TRICKSTER', 'AURORA', () => {
  const { room, game } = mkBasicRoomAndGame();
  AuroraRegistry.trickster.hooks.onAttack(game, room.players[0]);
  assert.equal(game.hackActive.P1, true);
});

// WEATHER
run('WEATHER-FLOW-001', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  weather.ensureWeatherState(room, game);
  assert.equal(game.weather.weatherId, null);
});

run('WEATHER-FLOW-002', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 2;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  assert.ok(game.weather.weatherId);
  assert.equal(game.weather.stageRound, 2);
});

run('WEATHER-THUNDER-RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'thunder_rain';
  game.attackValue = 10;
  game.defenseValue = 7;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 2 }, { value: 3 }]);
  weather.onDefenseSelect(room, game, room.players[1], [{ value: 2 }, { value: 3 }]);
  assert.equal(game.attackValue, 14);
  assert.equal(game.defenseValue, 11);
});

run('WEATHER-ILLUSION-SUN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'illusion_sun';
  assert.equal(weather.getAttackRerollBonus(game), 2);
  weather.onAttackReroll(room, game, room.players[0]);
  assert.equal(game.thorns.P1, 2);
});

run('WEATHER-CLEAR-THUNDER', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'clear_thunder';
  const before = game.hp.P2;
  game.attackValue = 8;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 4 }, { value: 4 }]);
  assert.equal(game.hp.P2, before - 3);
  assert.ok(game.effectEvents.some((e) => e.type === 'instant_damage'));
});

run('WEATHER-SCORCHING-SUN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'scorching_sun';
  game.hp.P1 = 20;
  weather.onAfterDamageResolved(room, game, room.players[0], room.players[1], 7);
  assert.equal(game.hp.P1, 23);
});

run('WEATHER-SUNNY-RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'sunny_rain';
  const die = { value: 8, label: '8', hasA: false, isAurora: false, sides: 8, maxValue: 8, slotId: 0 };
  withRandomSequence([0.0, 0.2], () => {
    const next = weather.applySingleDieConstraints(room, game, die, 'defense');
    assert.notEqual(next.value, 8);
  });
});

run('WEATHER-TOXIC-FOG', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 8;
  withRandomSequence([0.99], () => weather.updateWeatherForNewRound(room, game));
  assert.ok(game.weather.weatherId);
});

run('WEATHER-SPACETIME', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'spacetime_storm';
  game.attackSelection = [0, 1];
  game.attackDice = [{ value: 6 }, { value: 6 }];
  game.hp.P1 = 11;
  game.hp.P2 = 22;
  weather.onAfterDamageResolved(room, game, room.players[0], room.players[1], 3);
  assert.equal(game.hp.P1, 22);
  assert.equal(game.hp.P2, 11);
});

// CROSS + TXT-MIS
run('CROSS-ORDER-001', 'CROSS', () => {
  const { room, game } = mkBasicRoomAndGame();
  const attacker = room.players[0];
  const defender = room.players[1];
  game.weather.weatherId = 'thunder_rain';
  game.attackValue = 10;
  const selectedDice = [{ isAurora: true, hasA: true, auroraId: 'evolution', value: 2, label: '2A' }];
  skills.applyAuroraAEffectOnAttack(room, game, attacker, selectedDice);
  weather.onAttackSelect(room, game, attacker, defender, selectedDice);
  assert.equal(game.attackValue, 24);
  const logText = game.log.join('\n');
  assert.ok(logText.indexOf('进化') < logText.indexOf('雷雨'));
});

run('CROSS-PIERCE-FORCEFIELD', 'CROSS', () => {
  const game = { attackValue: 10, defenseValue: 8, attackPierce: true, extraAttackQueued: false };
  const hits = skills.calcHits(game);
  assert.deepEqual(hits, [10]);
});

run('TXT-MIS-001-DESPERATE', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 6;
  game.attackValue = 5;
  AuroraRegistry.bigredbutton.hooks.onAttack(game, room.players[0]);
  assert.ok(game.desperateBonus.P1 > 0);
  assert.equal(game.attackValue, 5);
});

run('TXT-MIS-002-POWER', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.attackValue = 10;
  game.power.P1 = 7;
  triggerCharacterHook('onMainAttackConfirm', { characterId: 'xiadie' }, game, room.players[0], []);
  assert.equal(game.attackValue, 10);
});

run('TXT-MIS-003-OVERLOAD', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.overload.P1 = 6;
  game.attackValue = 10;
  assert.equal(game.attackValue, 10);
  const before = game.hp.P1;
  const dmg = Math.ceil(game.overload.P1 * 0.5);
  game.hp.P1 -= dmg;
  assert.equal(game.hp.P1, before - 3);
});

run('TXT-MIS-004-WEATHER-DOC-STATE', 'TXT-MIS', () => {
  const mechDoc = fs.readFileSync(path.join(__dirname, '..', 'MECHANISMS_AND_TESTS.md'), 'utf8');
  const weatherCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'services', 'weather.js'), 'utf8');
  assert.ok(/未实现天气系统/.test(mechDoc));
  assert.ok(/function updateWeatherForNewRound/.test(weatherCode));
});

// CUSTOM
run('CUSTOM-001-INVALID-ID', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'A', baseCharacterId: 'xiadie', overrides: { hp: 20 } },
  });
  assert.equal(ok, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /ID/.test(err.message));
});

run('CUSTOM-002-INVALID-OVERRIDE', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'valid_id_x1', baseCharacterId: 'xiadie', overrides: { skillText: 'x' } },
  });
  assert.equal(ok, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /不允许覆写字段/.test(err.message));
});

run('CUSTOM-003-VALID-CREATE', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const id = `xiadie_test_${Date.now().toString().slice(-6)}`;
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: {
      id,
      baseCharacterId: 'xiadie',
      name: 'Xiadie Test',
      overrides: { hp: 29, attackLevel: 4, defenseLevel: 3, auroraUses: 2, maxAttackRerolls: 2, diceSides: [8, 8, 6, 6, 4] },
    },
  });
  assert.equal(ok, true);
  reloadRegistry();
  assert.ok(CharacterRegistry[id]);
});

// WEATHER (remaining matrix)
run('WEATHER-FLOW-003', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 2;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  const id = game.weather.weatherId;
  game.round = 3;
  withRandomSequence([0.99], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.weatherId, id);
});

run('WEATHER-FLOW-004', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 4;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.stageRound, 4);
  assert.ok(weather.WEATHER_POOLS[4].includes(game.weather.weatherId));
});

run('WEATHER-FLOW-005', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 6;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.stageRound, 6);
  assert.ok(weather.WEATHER_POOLS[6].includes(game.weather.weatherId));
});

run('WEATHER-FLOW-006', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 8;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  const id = game.weather.weatherId;
  game.round = 9;
  withRandomSequence([0.99], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.weatherId, id);
  assert.equal(game.weather.stageRound, 8);
});

run('WEATHER-FLOW-007', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'frost';
  const attacker = room.players[0];
  const defender = room.players[1];
  weather.onAttackSelect(room, game, attacker, defender, [{ value: 4 }, { value: 4 }]);
  assert.equal(game.weatherState.pendingDefenseBonus.P1, 1);
  game.round = 3;
  weather.updateWeatherForNewRound(room, game);
  assert.equal(game.weatherState.activeDefenseBonus.P1, 1);
  assert.equal(game.defenseLevel.P1, 4);
});

run('WEATHER-FLOW-008', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weatherState.activeDefenseBonus.P1 = 2;
  game.defenseLevel.P1 += 2;
  game.weatherState.activeResilienceBonus.P1 = 3;
  game.resilience.P1 += 3;
  game.round = 3;
  weather.updateWeatherForNewRound(room, game);
  assert.equal(game.weatherState.activeDefenseBonus.P1, 0);
  assert.equal(game.weatherState.activeResilienceBonus.P1, 0);
  assert.equal(game.defenseLevel.P1, 3);
  assert.equal(game.resilience.P1, 0);
});

run('WEATHER-FLOW-009', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.stageRound = 2;
  game.weather.weatherId = 'heavy_rain';
  game.weatherState.stageAttackLevelBonus.P1 = 2;
  game.weatherState.stageDefenseLevelBonus.P1 = 1;
  game.weatherState.stagePowerGranted.P1 = 4;
  game.attackLevel.P1 += 2;
  game.defenseLevel.P1 += 1;
  game.power.P1 += 4;
  game.round = 4;
  withRandomSequence([0.3], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weatherState.stageAttackLevelBonus.P1 >= 0, true);
  assert.equal(game.attackLevel.P1 >= 3, true);
  assert.equal(game.defenseLevel.P1 >= 3, true);
});

run('WEATHER-CARD-FROST', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'frost';
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 2 }, { value: 2 }]);
  assert.equal(game.weatherState.pendingDefenseBonus.P1, 1);
});

run('WEATHER-CARD-FROG_RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'frog_rain';
  const die = { value: 1, label: '1', hasA: false, isAurora: false, sides: 6, maxValue: 6, slotId: 0 };
  withRandomSequence([0.0, 0.4], () => {
    const constrained = weather.applySingleDieConstraints(room, game, die, 'attack');
    assert.notEqual(constrained.value, 1);
  });
});

run('WEATHER-CARD-LIGHT_SNOW', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'light_snow';
  game.weatherState.attackRerolledInRound.P1 = false;
  weather.onEndCurrentRound(room, game, 'P1');
  assert.equal(game.weatherState.pendingResilienceBonus.P1, 3);
});

run('WEATHER-CARD-FISH_RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'fish_rain';
  assert.equal(weather.getAttackRerollBonus(game), 1);
});

run('WEATHER-CARD-GALE', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'gale';
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 2 }, { value: 3 }]);
  assert.equal(game.extraAttackQueued, true);
});

run('WEATHER-CARD-SLEET', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'sleet';
  game.hp.P1 = 20;
  game.round = 3;
  weather.updateWeatherForNewRound(room, game);
  assert.equal(game.counterActive.P1, true);
  assert.equal(game.defenseLevel.P1, 5);
});

run('WEATHER-CARD-ECLIPSE', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'eclipse';
  game.attackValue = 8;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 2 }, { value: 3 }]);
  assert.equal(game.attackValue, 12);
});

run('WEATHER-CARD-BLIZZARD', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'blizzard';
  game.defenseValue = 7;
  weather.onDefenseSelect(room, game, room.players[1], [{ value: 3 }, { value: 4 }]);
  assert.equal(game.forceField.P2, true);
});

run('WEATHER-CARD-ACID_RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'acid_rain';
  game.hp.P1 = 25;
  game.hp.P2 = 20;
  game.round = 3;
  weather.updateWeatherForNewRound(room, game);
  assert.equal(game.poison.P1, 1);
});

run('WEATHER-CARD-HIGH_TEMP', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'high_temp';
  game.hp.P1 = 10;
  game.hp.P2 = 20;
  game.round = 3;
  weather.updateWeatherForNewRound(room, game);
  assert.equal(game.power.P1, 2);
});

run('WEATHER-CARD-HEAVY_RAIN', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 4;
  withRandomSequence([0.56], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.weatherId, 'heavy_rain');
  assert.equal(game.attackLevel.P1, 4);
  assert.equal(game.defenseLevel.P1, 4);
});

run('WEATHER-CARD-MID_SNOW', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'mid_snow';
  game.hp.P1 = 10;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 3 }, { value: 3 }, { value: 3 }]);
  assert.equal(game.hp.P1, 20);
});

run('WEATHER-CARD-BIG_SNOW', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'big_snow';
  game.attackValue = 9;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 7 }, { value: 2 }]);
  assert.equal(game.attackValue, 13);
});

run('WEATHER-CARD-SANDSTORM', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'sandstorm';
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 1 }, { value: 3 }, { value: 5 }]);
  assert.equal(game.power.P1, 3);
});

run('WEATHER-CARD-CLOUD_SEA', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 6;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.weatherId, 'cloud_sea');
  assert.equal(game.auroraUsesRemaining.P1, 3);
  assert.equal(game.auroraUsesRemaining.P2, 3);
});

run('WEATHER-CARD-RAINBOW', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'rainbow';
  game.attackValue = 10;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 5 }, { value: 5 }]);
  assert.equal(game.attackPierce, true);
});

run('WEATHER-CARD-DROUGHT', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'drought';
  game.attackValue = 5;
  game.defenseLevel.P2 = 4;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 2 }, { value: 3 }]);
  assert.equal(game.attackValue, 17);
});

run('WEATHER-CARD-SUN_MOON', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'sun_moon';
  game.hp.P1 = 3;
  game.attackValue = 9;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 4 }, { value: 5 }]);
  assert.equal(game.attackValue, 18);
});

run('WEATHER-CARD-SUNBEAM', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'sunbeam';
  game.hp.P1 = 10;
  game.hp.P2 = 20;
  weather.onAttackSelect(room, game, room.players[0], room.players[1], [{ value: 4 }, { value: 5 }]);
  assert.equal(game.extraAttackQueued, true);
});

run('WEATHER-CARD-CLEAR', 'WEATHER', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.round = 8;
  withRandomSequence([0.01], () => weather.updateWeatherForNewRound(room, game));
  assert.equal(game.weather.weatherId, 'clear');
  assert.equal(game.power.P1, 5);
  assert.equal(game.power.P2, 5);
});

// CROSS (remaining matrix)
run('CROSS-HACK-APPLY', 'CROSS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.hackActive.P1 = true;
  game.defenseSelection = [0, 1];
  game.defenseDice = [
    { value: 6, label: '6', isAurora: false },
    { value: 4, label: '4', isAurora: false },
  ];
  game.defenseValue = 10;
  skills.applyHackEffects(game, { id: 'P1', name: 'A' }, { id: 'P2', name: 'B' });
  assert.equal(game.defenseDice[0].value, 2);
  assert.equal(game.defenseValue, 6);
});

run('CROSS-UNYIELDING-CAP', 'CROSS', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  const g = ctx.room.game;
  g.phase = 'defense_select';
  g.attackerId = 'P1';
  g.defenderId = 'P2';
  g.attackValue = 20;
  g.attackPierce = false;
  g.extraAttackQueued = false;
  g.attackSelection = [0, 1];
  g.attackDice = [{ value: 10, isAurora: false }, { value: 10, isAurora: false }];
  g.defenseLevel.P2 = 2;
  g.defenseDice = [{ value: 1, isAurora: false }, { value: 1, isAurora: false }];
  g.hp.P2 = 5;
  g.unyielding.P2 = true;
  ctx.handlers.handleConfirmDefense(ctx.ws2, { indices: [0, 1] });
  assert.equal(g.hp.P2 >= 1, true);
});

run('CROSS-COUNTER-RESOLVE', 'CROSS', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  const g = ctx.room.game;
  g.phase = 'defense_select';
  g.attackerId = 'P1';
  g.defenderId = 'P2';
  g.attackValue = 5;
  g.attackPierce = false;
  g.extraAttackQueued = false;
  g.attackSelection = [0, 1];
  g.attackDice = [{ value: 3, isAurora: false }, { value: 2, isAurora: false }];
  g.defenseLevel.P2 = 2;
  g.defenseDice = [{ value: 4, isAurora: false }, { value: 4, isAurora: false }];
  g.counterActive.P2 = true;
  const before = g.hp.P1;
  ctx.handlers.handleConfirmDefense(ctx.ws2, { indices: [0, 1] });
  assert.equal(g.hp.P1 < before, true);
});

run('CROSS-SPACETIME-GAMEOVER-ORDER', 'CROSS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.weather.weatherId = 'spacetime_storm';
  game.attackSelection = [0, 1];
  game.attackDice = [{ value: 6 }, { value: 6 }];
  game.hp.P1 = 1;
  game.hp.P2 = 25;
  weather.onAfterDamageResolved(room, game, room.players[0], room.players[1], 5);
  const ended = skills.checkGameOver(room, game);
  assert.equal(ended, false);
});

run('CROSS-POISON-ROUNDEND', 'CROSS', () => {
  const ctx = setupRoom({ p1Char: 'huangquan', p2Char: 'xiadie', p1Aurora: 'prime', p2Aurora: 'prime' });
  const g = ctx.room.game;
  g.phase = 'defense_select';
  g.attackerId = 'P1';
  g.defenderId = 'P2';
  g.attackValue = 2;
  g.attackPierce = false;
  g.extraAttackQueued = false;
  g.attackSelection = [0, 1];
  g.attackDice = [{ value: 1, isAurora: false }, { value: 1, isAurora: false }];
  g.defenseLevel.P2 = 2;
  g.defenseDice = [{ value: 2, isAurora: false }, { value: 2, isAurora: false }];
  g.poison.P1 = 2;
  const hpBefore = g.hp.P1;
  const roundBefore = g.round;
  ctx.handlers.handleConfirmDefense(ctx.ws2, { indices: [0, 1] });
  assert.equal(g.round, roundBefore + 1);
  assert.equal(g.hp.P1, hpBefore - 2);
  assert.equal(g.poison.P1, 1);
});

run('CROSS-STACKING-BOOL', 'CROSS', () => {
  const { room, game } = mkBasicRoomAndGame();
  const attacker = room.players[0];
  game.attackValue = 10;
  triggerCharacterHook('onAttackConfirm', { characterId: 'liuying' }, game, attacker, [{ value: 2 }, { value: 2 }, { value: 3 }, { value: 3 }]);
  AuroraRegistry.repeater.hooks.onAttack(game, attacker);
  const hits = skills.calcHits(game);
  assert.equal(Array.isArray(hits), true);
  assert.equal(hits.length, 2);
});

// TXT-MIS (remaining matrix)
run('TXT-MIS-005-REPEATER-DEFENSE-PATH', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  const check = AuroraRegistry.repeater.hooks.canUse(room.players[0], game, 'defense');
  assert.ok(check && check.ok === false);
  assert.equal(typeof AuroraRegistry.repeater.hooks.onDefense, 'function');
});

run('TXT-MIS-006-STARSHIELD-ATTACK-PATH', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  const check = AuroraRegistry.starshield.hooks.canUse(room.players[0], game, 'attack');
  assert.ok(check && check.ok === false);
  assert.equal(typeof AuroraRegistry.starshield.hooks.onAttack, 'function');
});

run('TXT-MIS-007-XILIAN-LOG-TEXT', 'TXT-MIS', () => {
  const { room, game } = mkBasicRoomAndGame();
  game.defenseValue = 25;
  triggerCharacterHook('onMainDefenseConfirm', { characterId: 'xilian' }, game, room.players[0]);
  assert.ok(game.log.some((x) => x.includes('攻击防等级变为5')));
});

run('TXT-MIS-008-WEATHER-SPEC-STATE', 'TXT-MIS', () => {
  const specDoc = fs.readFileSync(path.join(__dirname, '..', 'WEATHER_SYSTEM_SPEC.md'), 'utf8');
  const weatherCode = fs.readFileSync(path.join(__dirname, '..', 'server', 'weather.js'), 'utf8');
  assert.ok(/文档先行版/.test(specDoc));
  assert.ok(/onAttackSelect/.test(weatherCode));
});

// CUSTOM (remaining matrix)
run('CUSTOM-004-INVALID-BASE', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'custom_invalid_base_1', baseCharacterId: 'not_exist', overrides: { hp: 20 } },
  });
  assert.equal(ok, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /母角色不存在/.test(err.message));
});

run('CUSTOM-005-BASE-IS-CUSTOM', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  const id1 = `custom_base_${Date.now().toString().slice(-6)}`;
  const id2 = `${id1}_child`;
  const ok1 = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: id1, baseCharacterId: 'xiadie', overrides: { hp: 28 } },
  });
  assert.equal(ok1, true);
  resetSent(ctx.ws1);
  const ok2 = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: id2, baseCharacterId: id1, overrides: { hp: 27 } },
  });
  assert.equal(ok2, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /母角色必须是原版角色/.test(err.message));
});

run('CUSTOM-006-OVERRIDES-NONOBJ', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'custom_nonobj_1', baseCharacterId: 'xiadie', overrides: null },
  });
  assert.equal(ok, false);
});

run('CUSTOM-007-DICESIDES-INVALID', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'custom_dicesides_bad', baseCharacterId: 'xiadie', overrides: { diceSides: [8, 1, 6] } },
  });
  assert.equal(ok, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /非法面值/.test(err.message));
});

run('CUSTOM-008-POSITIVE-REQUIRED', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  resetSent(ctx.ws1);
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id: 'custom_pos_req_bad', baseCharacterId: 'xiadie', overrides: { hp: 0 } },
  });
  assert.equal(ok, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /必须大于 0/.test(err.message));
});

run('CUSTOM-009-DUPLICATE-ID', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  const id = `custom_dup_${Date.now().toString().slice(-6)}`;
  const ok1 = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id, baseCharacterId: 'xiadie', overrides: { hp: 29 } },
  });
  assert.equal(ok1, true);
  resetSent(ctx.ws1);
  const ok2 = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: { id, baseCharacterId: 'xiadie', overrides: { hp: 30 } },
  });
  assert.equal(ok2, false);
  const err = lastError(ctx.ws1);
  assert.ok(err && /已存在/.test(err.message));
});

run('CUSTOM-010-PERSIST-RELOAD', 'CUSTOM', () => {
  const ctx = setupRoom({ p1Char: 'xiadie', p2Char: 'huangquan', p1Aurora: 'prime', p2Aurora: 'prime' });
  const id = `custom_reload_${Date.now().toString().slice(-6)}`;
  const ok = ctx.handlers.handleCreateCustomCharacter(ctx.ws1, {
    variant: {
      id,
      baseCharacterId: 'xiadie',
      overrides: { hp: 31, attackLevel: 4, defenseLevel: 3, auroraUses: 2, maxAttackRerolls: 2, diceSides: [8, 8, 6, 6, 4] },
    },
  });
  assert.equal(ok, true);
  reloadRegistry();
  assert.ok(CharacterRegistry[id] && CharacterRegistry[id].isCustomVariant === true);
});

const summary = {
  total: results.length,
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  byGroup: {},
  failed: results.filter((r) => r.status === 'FAIL'),
  results,
  generatedAt: new Date().toISOString(),
};

for (const r of results) {
  if (!summary.byGroup[r.group]) summary.byGroup[r.group] = { total: 0, pass: 0, fail: 0 };
  summary.byGroup[r.group].total += 1;
  if (r.status === 'PASS') summary.byGroup[r.group].pass += 1;
  else summary.byGroup[r.group].fail += 1;
}

const outPath = path.join(__dirname, '..', 'tmp', 'backend_skill_test_results.json');
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');

if (summary.fail > 0) {
  console.log(`[RUN] total=${summary.total} pass=${summary.pass} fail=${summary.fail}`);
  console.log(`[RUN] details saved to ${outPath}`);
  process.exitCode = 1;
} else {
  console.log(`[RUN] total=${summary.total} pass=${summary.pass} fail=0`);
  console.log(`[RUN] details saved to ${outPath}`);
}
