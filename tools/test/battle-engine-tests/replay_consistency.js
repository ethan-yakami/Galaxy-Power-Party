const {
  assert,
  createHandlers,
  engine,
  PHASE_ATTACK_REROLL_OR_SELECT,
  STATUS_ENDED,
  createProjectionUi,
  setRollBuffer,
  makeWs,
  highestIndices,
  drivePureGameToEnd,
  withSeededRandom,
} = require('./common');

module.exports = [
  {
    id: 'REP-001',
    title: 'pure room progression stays aligned with direct engine replay',
    tags: [
      'group:replay_consistency',
      'phase:attack_roll',
      'phase:defense_select',
      'character:liuying',
      'character:huangquan',
      'aurora:prime',
      'mechanism:pierce',
      'mechanism:counter',
      'mechanism:unyielding',
      'mechanism:hack',
      'mechanism:weather',
    ],
    arrange: 'Prepare a pure room, then clone its initial engine snapshot.',
    act: 'Run one full attack/defense exchange through handlers and direct engine actions.',
    assert: 'Round/hp/weather parity is preserved within pure-engine execution.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      const b = makeWs('P2');

      handlers.handleCreateRoom(a, { name: 'A' });
      handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
      handlers.handleChooseCharacter(a, { characterId: 'liuying' });
      handlers.handleChooseAurora(a, { auroraDiceId: 'prime' });
      handlers.handleChooseCharacter(b, { characterId: 'huangquan' });
      handlers.handleChooseAurora(b, { auroraDiceId: 'prime' });
      const room = rooms.get(a.playerRoomCode);
      const pureState = engine.deserializeState(room.replay.snapshots[0].state);
      const ui = createProjectionUi();
      let pureGame = engine.projectStateToLegacyRoom(pureState, ui);

      assert.strictEqual(room.game.attackerId, pureGame.attackerId);
      assert.strictEqual(room.game.defenderId, pureGame.defenderId);

      const attackerWs = room.game.attackerId === 'P1' ? a : b;
      const defenderWs = room.game.defenderId === 'P1' ? a : b;

      handlers.handleRollAttack(attackerWs);
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.ROLL_ATTACK, 0));
      pureGame = engine.projectStateToLegacyRoom(pureState, ui);
      assert.deepStrictEqual(room.game.attackDice.map((die) => die.value), pureGame.attackDice.map((die) => die.value));

      const attackNeed = room.game.attackLevel[room.game.attackerId];
      const attackIndices = highestIndices(room.game.attackDice, attackNeed);
      handlers.handleConfirmAttack(attackerWs, { indices: attackIndices });
      engine.applyActionInPlace(
        pureState,
        engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask(attackIndices, pureState.attackRoll.count)),
      );
      pureGame = engine.projectStateToLegacyRoom(pureState, ui);
      assert.strictEqual(room.game.attackValue, pureGame.attackValue);
      assert.strictEqual(room.game.phase, pureGame.phase);

      handlers.handleRollDefense(defenderWs);
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.ROLL_DEFENSE, 0));
      pureGame = engine.projectStateToLegacyRoom(pureState, ui);
      assert.deepStrictEqual(room.game.defenseDice.map((die) => die.value), pureGame.defenseDice.map((die) => die.value));

      const defenseNeed = room.game.defenseLevel[room.game.defenderId];
      const defenseIndices = highestIndices(room.game.defenseDice, defenseNeed);
      handlers.handleConfirmDefense(defenderWs, { indices: defenseIndices });
      engine.applyActionInPlace(
        pureState,
        engine.encodeAction(engine.OPCODES.CONFIRM_DEFENSE, engine.indicesToMask(defenseIndices, pureState.defenseRoll.count)),
      );
      pureGame = engine.projectStateToLegacyRoom(pureState, ui);

      assert.strictEqual(room.game.round, pureGame.round);
      assert.deepStrictEqual(room.game.hp, pureGame.hp);
      assert.strictEqual((room.game.weather && room.game.weather.weatherId) || null, (pureGame.weather && pureGame.weather.weatherId) || null);
    },
  },
  {
    id: 'REP-002',
    title: 'pure room stays aligned with direct engine replay for mixed-side rerolls',
    tags: ['group:replay_consistency', 'phase:attack_reroll_or_select', 'character:baie', 'aurora:berserker', 'mechanism:reroll'],
    arrange: 'Prepare a pure room, then clone its initial engine snapshot with berserker aurora.',
    act: 'Apply aurora use and two rerolls in both modes.',
    assert: 'Attack dice values/max/isAurora stay projection-consistent.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      const b = makeWs('P2');

      handlers.handleCreateRoom(a, { name: 'A' });
      handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
      handlers.handleChooseCharacter(a, { characterId: 'baie' });
      handlers.handleChooseAurora(a, { auroraDiceId: 'berserker' });
      handlers.handleChooseCharacter(b, { characterId: 'baie' });
      handlers.handleChooseAurora(b, { auroraDiceId: 'berserker' });
      const room = rooms.get(a.playerRoomCode);
      const pureState = engine.deserializeState(room.replay.snapshots[0].state);
      const ui = createProjectionUi();

      const attackerWs = room.game.attackerId === 'P1' ? a : b;

      handlers.handleRollAttack(attackerWs);
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.ROLL_ATTACK, 0));

      handlers.handleUseAurora(attackerWs);
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.USE_AURORA_ATTACK, 0));

      let rerollMask = null;
      let buffer = new Uint16Array(128);
      let actionCount = engine.enumerateActions(pureState, buffer);
      for (let i = 0; i < actionCount; i += 1) {
        if (engine.getActionOpcode(buffer[i]) === engine.OPCODES.REROLL_ATTACK) {
          rerollMask = engine.getActionMask(buffer[i]);
          break;
        }
      }

      const firstRerollIndices = pureState.catalog.indicesByMask[rerollMask];
      handlers.handleRerollAttack(attackerWs, { indices: firstRerollIndices });
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.REROLL_ATTACK, rerollMask));

      buffer = new Uint16Array(128);
      actionCount = engine.enumerateActions(pureState, buffer);
      rerollMask = null;
      for (let i = 0; i < actionCount; i += 1) {
        if (engine.getActionOpcode(buffer[i]) === engine.OPCODES.REROLL_ATTACK) {
          rerollMask = engine.getActionMask(buffer[i]);
          break;
        }
      }

      const secondRerollIndices = pureState.catalog.indicesByMask[rerollMask];
      handlers.handleRerollAttack(attackerWs, { indices: secondRerollIndices });
      engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.REROLL_ATTACK, rerollMask));

      const pureGame = engine.projectStateToLegacyRoom(pureState, ui);
      assert.deepStrictEqual(
        room.game.attackDice.map((die) => ({ value: die.value, maxValue: die.maxValue, isAurora: die.isAurora })),
        pureGame.attackDice.map((die) => ({ value: die.value, maxValue: die.maxValue, isAurora: die.isAurora })),
      );
    },
  },
  {
    id: 'REP-003',
    title: 'rolloutMany returns stable summary shape',
    tags: ['group:replay_consistency', 'phase:simulation', 'character:liuying', 'character:huangquan', 'aurora:prime'],
    arrange: 'Create initial state for rollout benchmark.',
    act: 'Run rolloutMany with 8 iterations.',
    assert: 'summary.iterations and totalSteps are valid.',
    run() {
      const initial = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 2024);
      const summary = engine.rolloutMany(initial, null, null, 8, 'bench-seed');
      assert.strictEqual(summary.iterations, 8);
      assert(summary.totalSteps > 0);
    },
  },
  {
    id: 'REP-004',
    title: 'replay export can rebuild deterministic winner/round',
    tags: ['group:replay_consistency', 'phase:ended', 'character:liuying', 'character:huangquan', 'aurora:prime', 'mechanism:replay'],
    arrange: 'Run a pure room to end and export replay.',
    act: 'Rebuild engine state by replay actions.',
    assert: 'Rebuilt state winner and rounds match exported result.',
    run() {
      process.env.GPP_ENGINE_MODE = 'pure';
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      const b = makeWs('P2');

      handlers.handleCreateRoom(a, { name: 'A' });
      handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
      handlers.handleChooseCharacter(a, { characterId: 'liuying' });
      handlers.handleChooseAurora(a, { auroraDiceId: 'prime' });
      handlers.handleChooseCharacter(b, { characterId: 'huangquan' });
      handlers.handleChooseAurora(b, { auroraDiceId: 'prime' });

      const room = rooms.get(a.playerRoomCode);
      assert(room && room.engineState, 'pure room should be initialized');

      drivePureGameToEnd(room, handlers, a, b);
      handlers.handleExportReplay(a, {}, { meta: { requestId: 'test-replay-1' } });

      const replayMessage = a.sent[a.sent.length - 1];
      assert(replayMessage, 'should receive replay export payload');
      assert.strictEqual(replayMessage.type, 'replay_export');
      assert.strictEqual(replayMessage.meta.requestId, 'test-replay-1');
      assert.strictEqual(typeof replayMessage.content, 'string');

      const replay = JSON.parse(replayMessage.content);
      assert.strictEqual(typeof replay.replayId, 'string');
      assert(replay.replayId.length > 0, 'replayId should exist');
      assert.strictEqual(replay.version, 'ReplayV2');
      assert(Array.isArray(replay.actions) && replay.actions.length > 0, 'replay actions should not be empty');
      assert(Array.isArray(replay.snapshots) && replay.snapshots.length > 0, 'replay snapshots should not be empty');
      assert.strictEqual(replay.snapshots.length, replay.actions.length + 1, 'snapshots should include step 0 + each action');
      assert.strictEqual(replay.snapshots[0].step, 0, 'first snapshot should be step 0');
      assert(replay.snapshots.every((snapshot) => snapshot && snapshot.view && typeof snapshot.view === 'object'), 'each snapshot should contain view');
      assert.strictEqual(replay.result.winnerPlayerId, room.game.winnerId);

      const replayState = engine.createBattle({
        players: replay.playersLoadout.map((player) => ({
          characterId: player.characterId,
          auroraDiceId: player.auroraDiceId,
        })),
      }, replay.seed, {
        startingAttacker: replay.roomMeta.startingAttacker,
      });

      for (const action of replay.actions) {
        const encodedAction = Number.isInteger(action.encodedAction)
          ? action.encodedAction
          : engine.encodeAction(action.opcode, action.actionMask || 0);
        const result = engine.applyActionInPlace(replayState, encodedAction);
        assert.strictEqual(result.ok, true, `replay action failed at step ${action.step}`);
      }

      assert.strictEqual(replayState.status, STATUS_ENDED);
      const replayWinnerId = replay.playersLoadout[replayState.winner].playerId;
      assert.strictEqual(replayWinnerId, replay.result.winnerPlayerId);
      assert.strictEqual(replayState.round, replay.result.rounds);
    },
  },
];

