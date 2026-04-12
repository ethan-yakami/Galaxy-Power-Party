const assert = require('assert');
const WebSocket = require('ws');

const createHandlers = require('../server/handlers');
const engine = require('../server/battle-engine');
const { hashSeed, nextFloat } = require('../server/battle-engine/rng');
const {
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_SELECT,
  SOURCE_NORMAL,
  SOURCE_AURORA,
} = require('../server/battle-engine/constants');

function makeWs(id) {
  return {
    playerId: id,
    playerRoomCode: null,
    reconnectToken: `${id}_token`,
    readyState: WebSocket.OPEN,
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
}

function highestIndices(dice, count) {
  return dice
    .map((die, index) => ({ index, value: die.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((item) => item.index);
}

function createProjectionUi() {
  return {
    indexToPlayerId: ['P1', 'P2'],
    attackPreviewMask: 0,
    defensePreviewMask: 0,
    logs: [],
    effectEvents: [],
  };
}

function setRollBuffer(roll, entries) {
  roll.count = entries.length;
  for (let i = 0; i < 6; i += 1) {
    roll.values[i] = 0;
    roll.maxValues[i] = 0;
    roll.sourceKinds[i] = SOURCE_NORMAL;
    roll.slotIndices[i] = -1;
    roll.auroraIndices[i] = -1;
    roll.hasA[i] = 0;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    roll.values[i] = entry.value;
    roll.maxValues[i] = entry.maxValue == null ? entry.value : entry.maxValue;
    roll.sourceKinds[i] = entry.isAurora ? SOURCE_AURORA : SOURCE_NORMAL;
    roll.slotIndices[i] = entry.isAurora ? -1 : (entry.slotIndex == null ? i : entry.slotIndex);
    roll.auroraIndices[i] = entry.auroraIndex == null ? -1 : entry.auroraIndex;
    roll.hasA[i] = entry.hasA ? 1 : 0;
  }
}

function makeLegacyDie(value, maxValue, options = {}) {
  return {
    value,
    label: options.hasA ? `${value}A` : `${value}`,
    hasA: !!options.hasA,
    isAurora: !!options.isAurora,
    sides: options.isAurora ? null : maxValue,
    maxValue,
    slotId: options.isAurora ? null : (options.slotId == null ? 0 : options.slotId),
    auroraId: options.auroraId || null,
    auroraName: options.auroraName || null,
    effectText: null,
    conditionText: null,
  };
}

function createStartedLegacyRoom(playerA, playerB) {
  process.env.GPP_ENGINE_MODE = 'legacy';
  const rooms = new Map();
  const handlers = createHandlers(rooms);
  const a = makeWs('P1');
  const b = makeWs('P2');

  handlers.handleCreateRoom(a, { name: 'A' });
  handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
  handlers.handleChooseCharacter(a, { characterId: playerA.characterId });
  handlers.handleChooseAurora(a, { auroraDiceId: playerA.auroraDiceId });
  handlers.handleChooseCharacter(b, { characterId: playerB.characterId });
  handlers.handleChooseAurora(b, { auroraDiceId: playerB.auroraDiceId });

  return { room: rooms.get(a.playerRoomCode), handlers, a, b };
}

function testCreateBattleStartingAttackerOverride() {
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
}

function testCloneAndSerialize() {
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
}

function testProjectorProtocolShape() {
  const state = engine.createBattle({
    players: [
      { characterId: 'liuying', auroraDiceId: 'prime' },
      { characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
  }, 456, { startingAttacker: 0 });

  state.selectedOneCount[0] = 2;
  state.overload[0] = 4;
  state.desperateBonus[0] = 7;
  const projected = engine.projectStateToLegacyRoom(state, createProjectionUi());
  assert.deepStrictEqual(projected.selectedOneCount, { P1: 2, P2: 0 });
  assert.deepStrictEqual(projected.overload, { P1: 4, P2: 0 });
  assert.deepStrictEqual(projected.desperateBonus, { P1: 7, P2: 0 });
  assert.deepStrictEqual(projected.weather, {
    stageRound: 0,
    weatherId: null,
    weatherName: null,
    weatherType: null,
    enteredAtRound: null,
    candidates: [],
  });
}

function testGlobalAttackBonusesApplyToAllCharacters() {
  const state = engine.createBattle({
    players: [
      { characterId: 'huangquan', auroraDiceId: 'prime' },
      { characterId: 'baie', auroraDiceId: 'prime' },
    ],
  }, 777, { startingAttacker: 0 });

  state.phase = PHASE_ATTACK_REROLL_OR_SELECT;
  state.power[0] = 3;
  state.overload[0] = 4;
  state.desperateBonus[0] = 5;
  setRollBuffer(state.attackRoll, [
    { value: 2, maxValue: 8 },
    { value: 4, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
  ]);

  const result = engine.applyActionInPlace(
    state,
    engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1], state.attackRoll.count)),
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(state.attackValue, 18);
}

function testLoanOverloadAppliesAttackBonusAndDefenseCost() {
  const attackState = engine.createBattle({
    players: [
      { characterId: 'huangquan', auroraDiceId: 'loan' },
      { characterId: 'baie', auroraDiceId: 'prime' },
    ],
  }, 778, { startingAttacker: 0 });

  attackState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
  setRollBuffer(attackState.attackRoll, [
    { value: 3, maxValue: 8 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 4, maxValue: 4, isAurora: true, auroraIndex: attackState.auroraIndex[0], hasA: true },
  ]);

  let result = engine.applyActionInPlace(
    attackState,
    engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 5], attackState.attackRoll.count)),
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(attackState.overload[0], 4);
  assert.strictEqual(attackState.attackValue, 11);

  const defenseState = engine.createBattle({
    players: [
      { characterId: 'fengjin', auroraDiceId: 'loan' },
      { characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
  }, 779, { startingAttacker: 1 });

  defenseState.phase = PHASE_DEFENSE_SELECT;
  defenseState.attacker = 1;
  defenseState.defender = 0;
  defenseState.attackValue = 0;
  defenseState.overload[0] = 4;
  setRollBuffer(defenseState.defenseRoll, [
    { value: 2, maxValue: 8 },
    { value: 3, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
  ]);

  const hpBefore = defenseState.hp[0];
  result = engine.applyActionInPlace(
    defenseState,
    engine.encodeAction(engine.OPCODES.CONFIRM_DEFENSE, engine.indicesToMask([0, 1], defenseState.defenseRoll.count)),
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(defenseState.hp[0], hpBefore - 2);
}

function testBigRedButtonAndXilianCumulative() {
  const brbState = engine.createBattle({
    players: [
      { characterId: 'huangquan', auroraDiceId: 'bigredbutton' },
      { characterId: 'baie', auroraDiceId: 'prime' },
    ],
  }, 780, { startingAttacker: 0 });

  brbState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
  brbState.round = 5;
  brbState.hp[0] = 20;
  setRollBuffer(brbState.attackRoll, [
    { value: 2, maxValue: 8 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 8, maxValue: 8, isAurora: true, auroraIndex: brbState.auroraIndex[0], hasA: true },
  ]);

  let result = engine.applyActionInPlace(
    brbState,
    engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 5], brbState.attackRoll.count)),
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(brbState.hp[0], 1);
  assert.strictEqual(brbState.desperateBonus[0], 19);
  assert.strictEqual(brbState.attackValue, 29);

  const xilianState = engine.createBattle({
    players: [
      { characterId: 'xilian', auroraDiceId: 'prime' },
      { characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
  }, 781, { startingAttacker: 0 });

  xilianState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
  xilianState.power[0] = 10;
  xilianState.xilianCumulative[0] = 18;
  setRollBuffer(xilianState.attackRoll, [
    { value: 2, maxValue: 8 },
    { value: 2, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 6 },
    { value: 1, maxValue: 4 },
  ]);

  result = engine.applyActionInPlace(
    xilianState,
    engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1, 2], xilianState.attackRoll.count)),
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(xilianState.attackValue, 15);
  assert.strictEqual(xilianState.xilianCumulative[0], 23);
  assert.strictEqual(xilianState.xilianAscensionActive[0], 0);
  assert.strictEqual(xilianState.attackLevel[0], 3);
}

function testLegacyPureParitySpecialAttackBonuses() {
  {
    const { room, handlers, a } = createStartedLegacyRoom(
      { characterId: 'huangquan', auroraDiceId: 'loan' },
      { characterId: 'baie', auroraDiceId: 'prime' },
    );
    room.game.phase = 'attack_reroll_or_select';
    room.game.attackerId = 'P1';
    room.game.defenderId = 'P2';
    room.game.power.P1 = 3;
    room.game.attackDice = [
      makeLegacyDie(3, 8, { slotId: 0 }),
      makeLegacyDie(1, 6, { slotId: 1 }),
      makeLegacyDie(1, 6, { slotId: 2 }),
      makeLegacyDie(1, 6, { slotId: 3 }),
      makeLegacyDie(1, 6, { slotId: 4 }),
      makeLegacyDie(4, 4, { isAurora: true, hasA: true, auroraId: 'loan' }),
    ];

    const pureState = engine.createBattle({
      players: [
        { characterId: 'huangquan', auroraDiceId: 'loan' },
        { characterId: 'baie', auroraDiceId: 'prime' },
      ],
    }, 900, { startingAttacker: 0 });
    pureState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
    pureState.power[0] = 3;
    setRollBuffer(pureState.attackRoll, [
      { value: 3, maxValue: 8 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 4, maxValue: 4, isAurora: true, auroraIndex: pureState.auroraIndex[0], hasA: true },
    ]);

    handlers.handleConfirmAttack(a, { indices: [0, 5] });
    const result = engine.applyActionInPlace(
      pureState,
      engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 5], pureState.attackRoll.count)),
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(room.game.attackValue, pureState.attackValue);
    assert.strictEqual(room.game.overload.P1, pureState.overload[0]);
  }

  {
    const { room, handlers, a } = createStartedLegacyRoom(
      { characterId: 'huangquan', auroraDiceId: 'bigredbutton' },
      { characterId: 'baie', auroraDiceId: 'prime' },
    );
    room.game.phase = 'attack_reroll_or_select';
    room.game.attackerId = 'P1';
    room.game.defenderId = 'P2';
    room.game.round = 5;
    room.game.hp.P1 = 20;
    room.game.attackDice = [
      makeLegacyDie(2, 8, { slotId: 0 }),
      makeLegacyDie(1, 6, { slotId: 1 }),
      makeLegacyDie(1, 6, { slotId: 2 }),
      makeLegacyDie(1, 6, { slotId: 3 }),
      makeLegacyDie(1, 6, { slotId: 4 }),
      makeLegacyDie(8, 8, { isAurora: true, hasA: true, auroraId: 'bigredbutton' }),
    ];

    const pureState = engine.createBattle({
      players: [
        { characterId: 'huangquan', auroraDiceId: 'bigredbutton' },
        { characterId: 'baie', auroraDiceId: 'prime' },
      ],
    }, 901, { startingAttacker: 0 });
    pureState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
    pureState.round = 5;
    pureState.hp[0] = 20;
    setRollBuffer(pureState.attackRoll, [
      { value: 2, maxValue: 8 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 1, maxValue: 6 },
      { value: 8, maxValue: 8, isAurora: true, auroraIndex: pureState.auroraIndex[0], hasA: true },
    ]);

    handlers.handleConfirmAttack(a, { indices: [0, 5] });
    const result = engine.applyActionInPlace(
      pureState,
      engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 5], pureState.attackRoll.count)),
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(room.game.attackValue, pureState.attackValue);
    assert.strictEqual(room.game.hp.P1, pureState.hp[0]);
    assert.strictEqual(room.game.desperateBonus.P1, pureState.desperateBonus[0]);
  }
}

function testPureHandlersSmoke() {
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
  assert.strictEqual(room.game.phase, 'defense_roll');

  handlers.handleRollDefense(defenderWs);
  const defenseNeed = room.game.defenseLevel[room.game.defenderId];
  handlers.handleConfirmDefense(defenderWs, { indices: highestIndices(room.game.defenseDice, defenseNeed) });
  assert.strictEqual(room.game.phase, 'attack_roll');
  assert.strictEqual(room.game.round, 2);
}

function testLegacyPureParity() {
  process.env.GPP_ENGINE_MODE = 'legacy';
  const rooms = new Map();
  const handlers = createHandlers(rooms);
  const a = makeWs('P1');
  const b = makeWs('P2');

  handlers.handleCreateRoom(a, { name: 'A' });
  handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
  handlers.handleChooseCharacter(a, { characterId: 'liuying' });
  handlers.handleChooseAurora(a, { auroraDiceId: 'prime' });
  handlers.handleChooseCharacter(b, { characterId: 'huangquan' });

  const originalRandom = Math.random;
  const seeded = { rngState: hashSeed(999) };
  Math.random = () => nextFloat(seeded);
  try {
    handlers.handleChooseAurora(b, { auroraDiceId: 'prime' });
    const room = rooms.get(a.playerRoomCode);

    const pureState = engine.createBattle({
      players: [
        { characterId: 'liuying', auroraDiceId: 'prime' },
        { characterId: 'huangquan', auroraDiceId: 'prime' },
      ],
    }, 999);
    let pureGame = engine.projectStateToLegacyRoom(pureState, createProjectionUi());

    assert.strictEqual(room.game.attackerId, pureGame.attackerId);
    assert.strictEqual(room.game.defenderId, pureGame.defenderId);

    const attackerWs = room.game.attackerId === 'P1' ? a : b;
    const defenderWs = room.game.defenderId === 'P1' ? a : b;

    handlers.handleRollAttack(attackerWs);
    engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.ROLL_ATTACK, 0));
    pureGame = engine.projectStateToLegacyRoom(pureState, createProjectionUi());
    assert.deepStrictEqual(room.game.attackDice.map((die) => die.value), pureGame.attackDice.map((die) => die.value));

    const attackNeed = room.game.attackLevel[room.game.attackerId];
    const attackIndices = highestIndices(room.game.attackDice, attackNeed);
    handlers.handleConfirmAttack(attackerWs, { indices: attackIndices });
    engine.applyActionInPlace(
      pureState,
      engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask(attackIndices, pureState.attackRoll.count)),
    );
    pureGame = engine.projectStateToLegacyRoom(pureState, createProjectionUi());
    assert.strictEqual(room.game.attackValue, pureGame.attackValue);
    assert.strictEqual(room.game.phase, pureGame.phase);

    handlers.handleRollDefense(defenderWs);
    engine.applyActionInPlace(pureState, engine.encodeAction(engine.OPCODES.ROLL_DEFENSE, 0));
    pureGame = engine.projectStateToLegacyRoom(pureState, createProjectionUi());
    assert.deepStrictEqual(room.game.defenseDice.map((die) => die.value), pureGame.defenseDice.map((die) => die.value));

    const defenseNeed = room.game.defenseLevel[room.game.defenderId];
    const defenseIndices = highestIndices(room.game.defenseDice, defenseNeed);
    handlers.handleConfirmDefense(defenderWs, { indices: defenseIndices });
    engine.applyActionInPlace(
      pureState,
      engine.encodeAction(engine.OPCODES.CONFIRM_DEFENSE, engine.indicesToMask(defenseIndices, pureState.defenseRoll.count)),
    );
    pureGame = engine.projectStateToLegacyRoom(pureState, createProjectionUi());

    assert.strictEqual(room.game.round, pureGame.round);
    assert.deepStrictEqual(room.game.hp, pureGame.hp);
    assert.strictEqual((room.game.weather && room.game.weather.weatherId) || null, (pureGame.weather && pureGame.weather.weatherId) || null);
  } finally {
    Math.random = originalRandom;
  }
}

function testLegacyPureParityMixedSideRerolls() {
  process.env.GPP_ENGINE_MODE = 'legacy';
  const rooms = new Map();
  const handlers = createHandlers(rooms);
  const a = makeWs('P1');
  const b = makeWs('P2');

  handlers.handleCreateRoom(a, { name: 'A' });
  handlers.handleJoinRoom(b, { name: 'B', code: a.playerRoomCode });
  handlers.handleChooseCharacter(a, { characterId: 'baie' });
  handlers.handleChooseAurora(a, { auroraDiceId: 'berserker' });
  handlers.handleChooseCharacter(b, { characterId: 'baie' });

  const originalRandom = Math.random;
  const seeded = { rngState: hashSeed(11) };
  Math.random = () => nextFloat(seeded);
  try {
    handlers.handleChooseAurora(b, { auroraDiceId: 'berserker' });
    const room = rooms.get(a.playerRoomCode);

    const pureState = engine.createBattle({
      players: [
        { characterId: 'baie', auroraDiceId: 'berserker' },
        { characterId: 'baie', auroraDiceId: 'berserker' },
      ],
    }, 11);
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
  } finally {
    Math.random = originalRandom;
  }
}

function testRollout() {
  const initial = engine.createBattle({
    players: [
      { characterId: 'liuying', auroraDiceId: 'prime' },
      { characterId: 'huangquan', auroraDiceId: 'prime' },
    ],
  }, 2024);
  const summary = engine.rolloutMany(initial, null, null, 8, 'bench-seed');
  assert.strictEqual(summary.iterations, 8);
  assert(summary.totalSteps > 0);
}

function main() {
  testCreateBattleStartingAttackerOverride();
  testCloneAndSerialize();
  testProjectorProtocolShape();
  testGlobalAttackBonusesApplyToAllCharacters();
  testLoanOverloadAppliesAttackBonusAndDefenseCost();
  testBigRedButtonAndXilianCumulative();
  testLegacyPureParitySpecialAttackBonuses();
  testPureHandlersSmoke();
  testLegacyPureParity();
  testLegacyPureParityMixedSideRerolls();
  testRollout();
  console.log('battle-engine tests passed');
}

main();
