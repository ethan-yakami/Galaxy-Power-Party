const { CHARACTER_RULES } = require('../../../src/core/battle-engine/rules/characters');
const { AURORA_RULES } = require('../../../src/core/battle-engine/rules/auroras');
const {
  assert,
  engine,
  PHASE_ATTACK_REROLL_OR_SELECT,
  PHASE_DEFENSE_SELECT,
  setRollBuffer,
  createStartedLegacyRoom,
  makeLegacyDie,
} = require('./common');

const coreMechanicsCases = [
  {
    id: 'MCH-001',
    title: 'global attack bonuses apply to attack value',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'character:huangquan',
      'character:baie',
      'aurora:prime',
      'mechanism:power',
      'mechanism:overload',
      'mechanism:desperate',
    ],
    arrange: 'Prepare attack roll and inject power/overload/desperate bonuses.',
    act: 'Confirm attack mask [0,1].',
    assert: 'attackValue includes all global attack bonuses.',
    run() {
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
    },
  },
  {
    id: 'MCH-002',
    title: 'loan overload applies attack bonus and defense self damage',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'phase:defense_select',
      'character:huangquan',
      'character:fengjin',
      'aurora:loan',
      'aurora:prime',
      'mechanism:overload',
    ],
    arrange: 'Attack and defense states with loan aurora.',
    act: 'Confirm attack then confirm defense.',
    assert: 'overload stack grants attack bonus and later causes defense self-damage.',
    run() {
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
    },
  },
  {
    id: 'MCH-003',
    title: 'big red button and xilian cumulative mechanics work',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'character:huangquan',
      'character:baie',
      'character:xilian',
      'aurora:bigredbutton',
      'aurora:prime',
      'mechanism:desperate',
      'mechanism:ascension',
    ],
    arrange: 'Prepare one big-red-button attack and one xilian attack.',
    act: 'Confirm attacks with prepared masks.',
    assert: 'big-red-button sets hp=1 with bonus; xilian cumulative/ascension states update correctly.',
    run() {
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
    },
  },
  {
    id: 'MCH-003A',
    title: 'fengjin power accumulation compounds from the current final attack value',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'phase:defense_select',
      'character:fengjin',
      'character:baie',
      'aurora:prime',
      'mechanism:power',
    ],
    arrange: 'Run two low-defense fengjin attacks with the same base dice.',
    act: 'Confirm attack/defense twice while forcing fengjin to attack both times.',
    assert: 'Power grows from 4 after the first 8-attack to 10 after the second 12-attack.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'fengjin', auroraDiceId: 'prime' },
          { characterId: 'baie', auroraDiceId: 'prime' },
        ],
      }, 782, { startingAttacker: 0 });

      state.phase = PHASE_ATTACK_REROLL_OR_SELECT;
      setRollBuffer(state.attackRoll, [
        { value: 4, maxValue: 8 },
        { value: 4, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
      ]);

      let result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1], state.attackRoll.count)),
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(state.attackValue, 8);

      state.phase = PHASE_DEFENSE_SELECT;
      setRollBuffer(state.defenseRoll, [
        { value: 1, maxValue: 8 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
      ]);

      result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_DEFENSE, engine.indicesToMask([0, 1], state.defenseRoll.count)),
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(state.power[0], 4);

      state.attacker = 0;
      state.defender = 1;
      state.phase = PHASE_ATTACK_REROLL_OR_SELECT;
      setRollBuffer(state.attackRoll, [
        { value: 4, maxValue: 8 },
        { value: 4, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
      ]);

      result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1], state.attackRoll.count)),
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(state.attackValue, 12);

      state.phase = PHASE_DEFENSE_SELECT;
      setRollBuffer(state.defenseRoll, [
        { value: 1, maxValue: 8 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
        { value: 1, maxValue: 6 },
      ]);

      result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_DEFENSE, engine.indicesToMask([0, 1], state.defenseRoll.count)),
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(state.power[0], 10);
    },
  },
  {
    id: 'MCH-004',
    title: 'handler projection stays aligned with pure engine for special attack bonuses',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'character:huangquan',
      'character:baie',
      'aurora:loan',
      'aurora:bigredbutton',
      'aurora:prime',
      'mechanism:parity',
      'mechanism:overload',
      'mechanism:desperate',
    ],
    arrange: 'Create equivalent handler-driven pure room and standalone pure state for special attacks.',
    act: 'Run confirm attack on both sides.',
    assert: 'attack value and side effects remain projection-consistent.',
    run() {
      {
        const { room, handlers, a } = createStartedLegacyRoom(
          { characterId: 'huangquan', auroraDiceId: 'loan' },
          { characterId: 'baie', auroraDiceId: 'prime' },
        );
        room.engineState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
        room.engineState.attacker = 0;
        room.engineState.defender = 1;
        room.engineState.power[0] = 3;
        setRollBuffer(room.engineState.attackRoll, [
          { value: 3, maxValue: 8 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 4, maxValue: 4, isAurora: true, auroraIndex: room.engineState.auroraIndex[0], hasA: true },
        ]);

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
        assert.strictEqual(room.engineState.overload[0], pureState.overload[0]);
      }

      {
        const { room, handlers, a } = createStartedLegacyRoom(
          { characterId: 'huangquan', auroraDiceId: 'bigredbutton' },
          { characterId: 'baie', auroraDiceId: 'prime' },
        );
        room.engineState.phase = PHASE_ATTACK_REROLL_OR_SELECT;
        room.engineState.attacker = 0;
        room.engineState.defender = 1;
        room.engineState.round = 5;
        room.engineState.hp[0] = 20;
        setRollBuffer(room.engineState.attackRoll, [
          { value: 2, maxValue: 8 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 1, maxValue: 6 },
          { value: 8, maxValue: 8, isAurora: true, auroraIndex: room.engineState.auroraIndex[0], hasA: true },
        ]);

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
        assert.strictEqual(room.engineState.hp[0], pureState.hp[0]);
        assert.strictEqual(room.engineState.desperateBonus[0], pureState.desperateBonus[0]);
      }
    },
  },
  {
    id: 'MCH-005',
    title: 'weather stage transition updates stage metadata',
    tags: [
      'group:mechanics_matrix',
      'phase:round_transition',
      'character:liuying',
      'character:huangquan',
      'aurora:prime',
      'mechanism:weather',
    ],
    arrange: 'Force state round to weather stage boundary and call weather update.',
    act: 'Invoke updateWeatherForNewRound.',
    assert: 'weather stage round and candidate metadata are updated.',
    run() {
      const runtime = engine.createRuntime();
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 2026, { startingAttacker: 0 });
      state.round = 2;
      const beforeStage = state.weatherStageRound;
      const beforeChanged = state.weatherChangedRound;
      const weatherRules = require('../../../src/core/battle-engine/rules/weather');
      weatherRules.updateWeatherForNewRound(state, runtime);
      assert.strictEqual(beforeStage, 0);
      assert.strictEqual(beforeChanged, 0);
      assert.strictEqual(state.weatherStageRound, 2);
      assert.strictEqual(state.weatherChangedRound, 2);
      assert(state.weatherCandidateCount >= 0);
    },
  },
  {
    id: 'MCH-006',
    title: 'liuying double strike triggers on two distinct pairs',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'character:liuying',
      'character:huangquan',
      'aurora:prime',
      'mechanism:double_strike',
    ],
    arrange: 'Use liuying with attack roll containing two distinct pairs.',
    act: 'Confirm attack with paired mask.',
    assert: 'extraAttackQueued is enabled after confirmation.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'prime' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 910, { startingAttacker: 0 });
      state.phase = PHASE_ATTACK_REROLL_OR_SELECT;
      setRollBuffer(state.attackRoll, [
        { value: 2, maxValue: 8 },
        { value: 2, maxValue: 8 },
        { value: 3, maxValue: 6 },
        { value: 3, maxValue: 6 },
        { value: 1, maxValue: 6 },
      ]);

      const result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1, 2, 3], state.attackRoll.count)),
      );
      assert.strictEqual(result.ok, true);
      assert.strictEqual(state.extraAttackQueued, 1);
    },
  },
  {
    id: 'MCH-007',
    title: 'destiny aurora cannot be skipped in confirm attack',
    tags: [
      'group:mechanics_matrix',
      'phase:attack_reroll_or_select',
      'character:liuying',
      'character:huangquan',
      'aurora:destiny',
      'aurora:prime',
      'mechanism:destiny',
    ],
    arrange: 'Construct attack roll containing destiny aurora die.',
    act: 'Confirm attack without selecting destiny die.',
    assert: 'Engine rejects action and returns invalid reason.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: 'destiny' },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, 911, { startingAttacker: 0 });
      state.phase = PHASE_ATTACK_REROLL_OR_SELECT;
      setRollBuffer(state.attackRoll, [
        { value: 2, maxValue: 8 },
        { value: 4, maxValue: 6 },
        { value: 6, maxValue: 6 },
        { value: 5, maxValue: 6 },
        { value: 3, maxValue: 3, isAurora: true, auroraIndex: state.auroraIndex[0], hasA: true },
      ]);

      const result = engine.applyActionInPlace(
        state,
        engine.encodeAction(engine.OPCODES.CONFIRM_ATTACK, engine.indicesToMask([0, 1, 2, 3], state.attackRoll.count)),
      );
      assert.strictEqual(result.ok, false);
      assert.strictEqual(typeof result.reason, 'string');
      assert(result.reason.includes('命'));
    },
  },
];

function createCharacterSmokeCases() {
  return Object.keys(CHARACTER_RULES).sort().map((characterId) => ({
    id: `SMOKE-CHAR-${characterId}`,
    title: `character smoke: ${characterId}`,
    tags: ['group:mechanics_matrix', `character:${characterId}`],
    arrange: 'Create battle with current character and a stable opponent.',
    act: 'Build initial state.',
    assert: 'State creation succeeds and character index is resolved.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId, auroraDiceId: 'prime' },
          { characterId: 'liuying', auroraDiceId: 'prime' },
        ],
      }, `smoke-char-${characterId}`, { startingAttacker: 0 });
      const idx = state.characterIndex[0];
      const character = state.catalog.characters[idx];
      assert(character, `character should resolve: ${characterId}`);
      assert.strictEqual(character.behaviorKey, characterId);
    },
  }));
}

function createAuroraSmokeCases() {
  return Object.keys(AURORA_RULES).sort().map((auroraId) => ({
    id: `SMOKE-AUR-${auroraId}`,
    title: `aurora smoke: ${auroraId}`,
    tags: ['group:mechanics_matrix', `aurora:${auroraId}`],
    arrange: 'Create battle with current aurora and a stable character.',
    act: 'Build initial state.',
    assert: 'State creation succeeds and aurora index is resolved.',
    run() {
      const state = engine.createBattle({
        players: [
          { characterId: 'liuying', auroraDiceId: auroraId },
          { characterId: 'huangquan', auroraDiceId: 'prime' },
        ],
      }, `smoke-aurora-${auroraId}`, { startingAttacker: 0 });
      const idx = state.auroraIndex[0];
      const aurora = state.catalog.auroras[idx];
      assert(aurora, `aurora should resolve: ${auroraId}`);
      assert.strictEqual(aurora.id, auroraId);
    },
  }));
}

module.exports = [
  ...coreMechanicsCases,
  ...createCharacterSmokeCases(),
  ...createAuroraSmokeCases(),
];


