const {
  assert,
  createHandlers,
  engine,
  createProjectionUi,
  makeWs,
  highestIndices,
  scheduleAIAction,
  setRollBuffer,
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_SELECT,
  withImmediateTimers,
} = require('./common');
const { CharacterRegistry } = require('../../../src/server/services/registry');
const { RESTRICTED_AI_LOADOUTS } = require('../../../src/server/ai/config');
const { createAIPlayer, reRandomizeAIPlayer } = require('../../../src/server/ai');

module.exports = [
  {
    id: 'GEN-001',
    title: 'createBattle supports starting attacker override',
    tags: ['group:general_rules', 'phase:setup', 'character:liuying', 'character:huangquan', 'aurora:prime'],
    arrange: 'Create two battles with same seed and different startingAttacker.',
    act: 'Read attacker/defender indexes.',
    assert: 'Attacker/defender indexes follow options.startingAttacker.',
    run() {
      const first = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 123, { startingAttacker: 0 });
      assert.strictEqual(first.attacker, 0);
      assert.strictEqual(first.defender, 1);

      const second = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 123, { startingAttacker: 1 });
      assert.strictEqual(second.attacker, 1);
      assert.strictEqual(second.defender, 0);
    },
  },
  {
    id: 'GEN-002',
    title: 'clone/serialize/deserialize keep state stable',
    tags: ['group:general_rules', 'phase:runtime', 'character:liuying', 'character:huangquan', 'aurora:prime'],
    arrange: 'Create battle and apply one action.',
    act: 'Clone and serialize/deserialize state.',
    assert: 'Snapshots are equal and diverge after extra mutation.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 123);

      engine.applyActionInPlace(state, engine.encodeAction(engine.OPCODES.ROLL_ATTACK, 0));
      const clone = engine.cloneState(state);
      assert.strictEqual(clone.phase, state.phase);
      assert.deepStrictEqual(engine.serializeState(clone), engine.serializeState(state));

      const snapshot = engine.serializeState(state);
      const restored = engine.deserializeState(snapshot);
      assert.deepStrictEqual(engine.serializeState(restored), snapshot);

      engine.applyActionInPlace(clone, engine.encodeAction(engine.OPCODES.USE_AURORA_ATTACK, 0));
      assert.notDeepStrictEqual(engine.serializeState(clone), engine.serializeState(state));
    },
  },
  {
    id: 'GEN-003',
    title: 'projector returns stable protocol shape',
    tags: ['group:general_rules', 'phase:projection', 'character:liuying', 'character:huangquan', 'aurora:prime'],
    arrange: 'Create pure state and write several counters.',
    act: 'Project state to legacy room shape.',
    assert: 'selectedOneCount/overload/desperateBonus/weather fields match expected shape.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 456, { startingAttacker: 0 });

      state.selectedOneCount[0] = 2;
      state.selectedFourCount[0] = 1;
      state.overload[0] = 4;
      state.desperateBonus[0] = 7;
      state.forceField[0] = 1;
      state.whiteeGuardUsed[0] = 1;
      state.whiteeGuardActive[0] = 1;
      state.unyielding[0] = 1;
      state.counterActive[0] = 1;
      state.roundAuroraUsed[0] = 1;
      state.resilience[0] = 3;
      state.power[0] = 5;
      state.hackActive[0] = 1;
      state.danhengCounterReady[0] = 1;
      state.auroraAEffectCount[0] = 2;
      state.xilianCumulative[0] = 6;
      state.xilianAscensionActive[0] = 1;
      state.yaoguangRerollsUsed[0] = 1;
      const projected = engine.projectStateToLegacyRoom(state, createProjectionUi());
      assert.deepStrictEqual(projected.selectedFourCount, { P1: 1, P2: 0 });
      assert.deepStrictEqual(projected.selectedOneCount, { P1: 2, P2: 0 });
      assert.deepStrictEqual(projected.overload, { P1: 4, P2: 0 });
      assert.deepStrictEqual(projected.desperateBonus, { P1: 7, P2: 0 });
      assert.deepStrictEqual(projected.roundAuroraUsed, { P1: true, P2: false });
      assert.deepStrictEqual(projected.forceField, { P1: true, P2: false });
      assert.deepStrictEqual(projected.whiteeGuardUsed, { P1: true, P2: false });
      assert.deepStrictEqual(projected.whiteeGuardActive, { P1: true, P2: false });
      assert.deepStrictEqual(projected.unyielding, { P1: true, P2: false });
      assert.deepStrictEqual(projected.counterActive, { P1: true, P2: false });
      assert.deepStrictEqual(projected.resilience, { P1: 3, P2: 0 });
      assert.deepStrictEqual(projected.power, { P1: 5, P2: 0 });
      assert.deepStrictEqual(projected.hackActive, { P1: true, P2: false });
      assert.deepStrictEqual(projected.danhengCounterReady, { P1: true, P2: false });
      assert.deepStrictEqual(projected.auroraAEffectCount, { P1: 2, P2: 0 });
      assert.deepStrictEqual(projected.xilianCumulative, { P1: 6, P2: 0 });
      assert.deepStrictEqual(projected.xilianAscensionActive, { P1: true, P2: false });
      assert.deepStrictEqual(projected.yaoguangRerollsUsed, { P1: 1, P2: 0 });
      assert.deepStrictEqual(projected.weather, {
        stageRound: 0,
        weatherId: null,
        weatherName: null,
        weatherType: null,
        enteredAtRound: null,
        candidates: [],
      });
    },
  },
  {
    id: 'GEN-004',
    title: 'pure handlers smoke through one round',
    tags: ['group:general_rules', 'phase:attack_roll', 'phase:defense_select', 'character:liuying', 'character:huangquan', 'aurora:prime'],
    arrange: 'Create pure room and complete one attack/defense cycle.',
    act: 'Execute roll/confirm actions via handlers.',
    assert: 'Flow moves to next round attack_roll.',
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
      assert(room.engineState, 'pure mode should create engineState');
      assert.strictEqual(room.engineMode, 'pure');
      assert.strictEqual(room.game.phase, 'attack_roll');

      const attackerWs = room.game.attackerId === 'P1' ? a : b;
      const defenderWs = room.game.defenderId === 'P1' ? a : b;

      handlers.handleRollAttack(attackerWs);
      assert.strictEqual(room.game.phase, 'attack_reroll_or_select');

      const attackNeed = room.game.attackLevel[room.game.attackerId];
      handlers.handleConfirmAttack(attackerWs, { indices: highestIndices(room.game.attackDice, attackNeed) });
      assert.strictEqual(room.game.phase, 'defense_select');
      const defenseNeed = room.game.defenseLevel[room.game.defenderId];
      handlers.handleConfirmDefense(defenderWs, { indices: highestIndices(room.game.defenseDice, defenseNeed) });
      assert.strictEqual(room.game.phase, 'attack_roll');
      assert.strictEqual(room.game.round, 2);
    },
  },
  {
    id: 'GEN-005',
    title: 'default engine mode is pure',
    tags: ['group:general_rules', 'phase:setup'],
    arrange: 'Unset GPP_ENGINE_MODE.',
    act: 'Create room via handlers.',
    assert: 'room.engineMode defaults to pure.',
    run() {
      const prev = process.env.GPP_ENGINE_MODE;
      delete process.env.GPP_ENGINE_MODE;
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      handlers.handleCreateRoom(a, { name: 'A' });
      const room = rooms.get(a.playerRoomCode);
      assert(room, 'room should exist');
      assert.strictEqual(room.engineMode, 'pure');
      if (typeof prev === 'string') {
        process.env.GPP_ENGINE_MODE = prev;
      } else {
        delete process.env.GPP_ENGINE_MODE;
      }
    },
  },
  {
    id: 'GEN-006',
    title: 'explicit legacy engine mode is ignored in favor of pure',
    tags: ['group:general_rules', 'phase:setup'],
    arrange: 'Set GPP_ENGINE_MODE=legacy.',
    act: 'Create room via handlers.',
    assert: 'room.engineMode remains pure.',
    run() {
      const prev = process.env.GPP_ENGINE_MODE;
      process.env.GPP_ENGINE_MODE = 'legacy';
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      handlers.handleCreateRoom(a, { name: 'A' });
      const room = rooms.get(a.playerRoomCode);
      assert(room, 'room should exist');
      assert.strictEqual(room.engineMode, 'pure');
      if (typeof prev === 'string') {
        process.env.GPP_ENGINE_MODE = prev;
      } else {
        delete process.env.GPP_ENGINE_MODE;
      }
    },
  },
  {
    id: 'GEN-007',
    title: 'pure AI attack selection resolves even when player index cache is missing',
    tags: ['group:general_rules', 'phase:attack_reroll_or_select', 'character:shajin', 'aurora:medic'],
    arrange: 'Create an AI room, force AI into attack selection, and drop engineUi.playerIdToIndex.',
    act: 'Run scheduleAIAction with immediate timers.',
    assert: 'AI confirms attack instead of stalling in attack_reroll_or_select.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const human = makeWs('P1');

      handlers.handleCreateAIRoom(human, { name: 'Human' });
      const room = rooms.get(human.playerRoomCode);
      const aiPlayer = room.players.find((player) => player.ws && player.ws.isAI);
      aiPlayer.characterId = 'shajin';
      aiPlayer.auroraDiceId = 'medic';
      aiPlayer.auroraSelectionConfirmed = true;

      handlers.handleApplyPreset(human, { characterId: 'liuying', auroraDiceId: 'prime' });

      const aiIndex = room.engineUi.indexToPlayerId.indexOf(aiPlayer.id);
      room.engineUi.playerIdToIndex = {};
      room.engineState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
      room.engineState.attacker = aiIndex;
      room.engineState.defender = 1 - aiIndex;
      room.engineState.rerollsLeft = 0;
      room.engineState.roundAuroraUsed[aiIndex] = 1;
      room.engineState.auroraUsesRemaining[aiIndex] = 0;
      room.engineState.resilience[aiIndex] = 4;
      setRollBuffer(room.engineState.attackRoll, [
        { value: 2, maxValue: 6, slotIndex: 0 },
        { value: 6, maxValue: 6, slotIndex: 1 },
        { value: 5, maxValue: 6, slotIndex: 2 },
        { value: 4, maxValue: 6, slotIndex: 3 },
        { value: 1, maxValue: 6, slotIndex: 4 },
      ]);
      room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);

      withImmediateTimers(() => {
        scheduleAIAction(room, rooms, handlers);
      });

      assert.strictEqual(room.game.phase, 'defense_select');
      assert(room.game.attackSelection && room.game.attackSelection.length > 0, 'AI should confirm an attack selection');
    },
  },
  {
    id: 'GEN-008',
    title: 'pure AI defense selection resolves for 白厄 guard scoring hooks',
    tags: ['group:general_rules', 'phase:defense_select', 'character:baie', 'aurora:prime'],
    arrange: 'Create an AI room and force 白厄 into defense selection.',
    act: 'Run scheduleAIAction with immediate timers.',
    assert: 'AI confirms defense and the round advances.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const human = makeWs('P1');

      handlers.handleCreateAIRoom(human, { name: 'Human' });
      const room = rooms.get(human.playerRoomCode);
      const aiPlayer = room.players.find((player) => player.ws && player.ws.isAI);
      aiPlayer.characterId = 'baie';
      aiPlayer.auroraDiceId = 'prime';
      aiPlayer.auroraSelectionConfirmed = true;

      handlers.handleApplyPreset(human, { characterId: 'huangquan', auroraDiceId: 'prime' });

      const aiIndex = room.engineUi.indexToPlayerId.indexOf(aiPlayer.id);
      room.engineState.phase = PHASE_DEFENSE_SELECT;
      room.engineState.attacker = 1 - aiIndex;
      room.engineState.defender = aiIndex;
      room.engineState.attackValue = 12;
      room.engineState.roundAuroraUsed[aiIndex] = 1;
      room.engineState.auroraUsesRemaining[aiIndex] = 0;
      room.engineState.whiteeGuardUsed[aiIndex] = 0;
      setRollBuffer(room.engineState.defenseRoll, [
        { value: 6, maxValue: 6, slotIndex: 0 },
        { value: 5, maxValue: 6, slotIndex: 1 },
        { value: 2, maxValue: 6, slotIndex: 2 },
        { value: 1, maxValue: 6, slotIndex: 3 },
        { value: 4, maxValue: 6, slotIndex: 4 },
      ]);
      room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);

      withImmediateTimers(() => {
        scheduleAIAction(room, rooms, handlers);
      });

      assert(
        room.game.phase !== 'defense_select' || room.game.round > 1,
        'AI defense selection should advance state or enter next round',
      );
      assert(room.game.round >= 1, 'room should still have a valid round after defense resolution');
    },
  },
  {
    id: 'GEN-009',
    title: 'AI scheduling keeps a single pending timer per phase snapshot',
    tags: ['group:general_rules', 'phase:attack_roll', 'character:shajin', 'aurora:prime'],
    arrange: 'Create an AI room and force AI into attack_roll.',
    act: 'Schedule AI twice without executing timers.',
    assert: 'The first timer is cleared and only the latest pending timer remains.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const human = makeWs('P1');

      handlers.handleCreateAIRoom(human, { name: 'Human' });
      const room = rooms.get(human.playerRoomCode);
      const aiPlayer = room.players.find((player) => player.ws && player.ws.isAI);
      aiPlayer.characterId = 'shajin';
      aiPlayer.auroraDiceId = 'prime';
      aiPlayer.auroraSelectionConfirmed = true;

      handlers.handleApplyPreset(human, { characterId: 'baie', auroraDiceId: 'legacy' });

      const aiIndex = room.engineUi.indexToPlayerId.indexOf(aiPlayer.id);
      room.engineState.phase = 0;
      room.engineState.attacker = aiIndex;
      room.engineState.defender = 1 - aiIndex;
      room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);

      const scheduled = [];
      const cleared = [];
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      let nextId = 1;
      global.setTimeout = (callback, delay) => {
        const id = nextId++;
        scheduled.push({ id, callback, delay });
        return id;
      };
      global.clearTimeout = (id) => {
        cleared.push(id);
      };

      try {
        scheduleAIAction(room, rooms, handlers);
        const firstTimerId = aiPlayer.autoActionTimer;
        assert(firstTimerId, 'first AI timer should be stored');
        scheduleAIAction(room, rooms, handlers);
        assert.notStrictEqual(aiPlayer.autoActionTimer, firstTimerId, 'second scheduling should replace the timer');
        assert(cleared.includes(firstTimerId), 'previous timer should be cleared');
        assert(room.aiAction && room.aiAction.actorId === 'AI', 'room should expose pending AI action metadata');
      } finally {
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
      }
    },
  },
  {
    id: 'GEN-010',
    title: 'stale AI timers do not execute actions after phase changes',
    tags: ['group:general_rules', 'phase:attack_roll', 'phase:defense_roll', 'character:shajin', 'aurora:prime'],
    arrange: 'Create an AI room, schedule an AI attack roll, then mutate the phase before the timer fires.',
    act: 'Run the captured timer callback after the snapshot changes.',
    assert: 'The stale callback is discarded and does not invoke the AI handler.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const human = makeWs('P1');

      handlers.handleCreateAIRoom(human, { name: 'Human' });
      const room = rooms.get(human.playerRoomCode);
      const aiPlayer = room.players.find((player) => player.ws && player.ws.isAI);
      aiPlayer.characterId = 'shajin';
      aiPlayer.auroraDiceId = 'prime';
      aiPlayer.auroraSelectionConfirmed = true;

      handlers.handleApplyPreset(human, { characterId: 'baie', auroraDiceId: 'legacy' });

      const aiIndex = room.engineUi.indexToPlayerId.indexOf(aiPlayer.id);
      room.engineState.phase = 0;
      room.engineState.attacker = aiIndex;
      room.engineState.defender = 1 - aiIndex;
      room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);

      let storedCallback = null;
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      const originalHandleRollAttack = handlers.handleRollAttack;
      let rollAttackCalls = 0;
      handlers.handleRollAttack = (ws) => {
        rollAttackCalls += 1;
        return originalHandleRollAttack(ws);
      };
      global.setTimeout = (callback) => {
        storedCallback = callback;
        return 1;
      };
      global.clearTimeout = () => {};

      try {
        scheduleAIAction(room, rooms, handlers);
        assert(storedCallback, 'AI callback should be captured');
        room.engineState.phase = 2;
        room.engineState.defender = aiIndex;
        room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);
        storedCallback();
        assert.strictEqual(rollAttackCalls, 0, 'stale callback should not invoke attack roll');
      } finally {
        handlers.handleRollAttack = originalHandleRollAttack;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
      }
    },
  },
  {
    id: 'GEN-011',
    title: 'defense live selection updates defense preview for first room player',
    tags: ['group:general_rules', 'phase:defense_select', 'character:baie', 'character:huangquan', 'aurora:legacy'],
    arrange: 'Create a started room and force P1 to be defender at defense_select.',
    act: 'Send update_live_selection from P1.',
    assert: 'selection is persisted into defense preview, not attack preview.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const a = makeWs('P1');
      const b = makeWs('P2');

      handlers.handleCreateRoom(a, { name: 'A' });
      handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
      handlers.handleApplyPreset(a, { characterId: 'baie', auroraDiceId: 'legacy' });
      handlers.handleApplyPreset(b, { characterId: 'huangquan', auroraDiceId: 'prime' });

      const room = rooms.get(a.playerRoomCode);
      room.engineState.phase = PHASE_DEFENSE_SELECT;
      room.engineState.attacker = 1;
      room.engineState.defender = 0;
      setRollBuffer(room.engineState.defenseRoll, [
        { value: 4, maxValue: 8, slotIndex: 0 },
        { value: 5, maxValue: 6, slotIndex: 1 },
        { value: 6, maxValue: 6, slotIndex: 2 },
      ]);
      room.engineUi.attackPreviewMask = 0;
      room.engineUi.defensePreviewMask = 0;
      room.game = engine.projectStateToLegacyRoom(room.engineState, room.engineUi);

      handlers.handleUpdateLiveSelection(a, { indices: [0, 2] });

      assert.strictEqual(room.engineUi.attackPreviewMask, 0);
      assert.strictEqual(room.engineUi.defensePreviewMask, engine.indicesToMask([0, 2]));
      assert.deepStrictEqual(room.game.defensePreviewSelection, [0, 2]);
    },
  },
  {
    id: 'GEN-012',
    title: 'AI zhigengniao loadout never equips aurora die',
    tags: ['group:general_rules', 'phase:setup', 'character:zhigengniao'],
    arrange: 'Force AI random character pick to zhigengniao.',
    act: 'Create and rerandomize AI player with deterministic random.',
    assert: 'auroraDiceId remains null for zhigengniao.',
    run() {
      const loadoutPool = RESTRICTED_AI_LOADOUTS
        .filter((loadout) => CharacterRegistry[loadout.characterId]);
      const zhigengniaoIndex = loadoutPool.findIndex((loadout) => loadout.characterId === 'zhigengniao');
      assert(zhigengniaoIndex >= 0, 'zhigengniao should exist in AI pool');

      const originalRandom = Math.random;
      Math.random = () => ((zhigengniaoIndex + 0.01) / loadoutPool.length);

      try {
        const aiPlayer = createAIPlayer('9000');
        assert.strictEqual(aiPlayer.characterId, 'zhigengniao');
        assert.strictEqual(aiPlayer.auroraDiceId, null);
        assert.strictEqual(aiPlayer.auroraSelectionConfirmed, true);

        reRandomizeAIPlayer(aiPlayer);
        assert.strictEqual(aiPlayer.characterId, 'zhigengniao');
        assert.strictEqual(aiPlayer.auroraDiceId, null);
        assert.strictEqual(aiPlayer.auroraSelectionConfirmed, true);
      } finally {
        Math.random = originalRandom;
      }
    },
  },
  {
    id: 'GEN-013',
    title: 'zhigengniao preset starts AI room without aurora crash',
    tags: ['group:general_rules', 'phase:setup', 'character:zhigengniao'],
    arrange: 'Create an AI room and apply a zhigengniao preset without auroraDiceId.',
    act: 'Start game via handleApplyPreset.',
    assert: 'Room enters in_game and engine state is created without server error.',
    run() {
      const rooms = new Map();
      const handlers = createHandlers(rooms);
      const human = makeWs('P1');

      handlers.handleCreateAIRoom(human, { name: 'Human' });
      const room = rooms.get(human.playerRoomCode);
      assert(room, 'room should exist');

      handlers.handleApplyPreset(human, { characterId: 'zhigengniao' });

      assert.strictEqual(room.status, 'in_game');
      assert(room.engineState, 'engineState should be created');
      assert(room.game && room.game.phase, 'projected game should exist');

      const humanIndex = room.engineUi.indexToPlayerId.indexOf('P1');
      assert(humanIndex >= 0, 'human index should exist in engine ui');
      assert.strictEqual(room.engineState.auroraUsesRemaining[humanIndex], 0);
    },
  },
];

