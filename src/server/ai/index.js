const {
  CharacterRegistry,
  AuroraRegistry,
  allowsNoAurora,
  characterAiScoreAttack,
  characterAiScoreDefense,
  characterAiFilterReroll,
} = require('../services/registry');
const { canUseAurora } = require('../services/skills');
const { getEffectiveSelectionCount } = require('../services/dice');
const { buildPendingActionSet } = require('../services/battle-actions');
const { DEFAULT_DIFFICULTY, RESTRICTED_AI_LOADOUTS, getDifficultyConfig } = require('./config');
const { scoreActionLocal, projectPureGame } = require('./evaluator');
const { applyTacticalOverrides } = require('./tactical-overrides');
const { pickCandidateActions, searchBestAction } = require('./search');
const { choosePureActionForState } = require('./policy');
const {
  cloneState,
  enumerateActions,
  applyActionInPlace,
  rolloutMany,
  getActionOpcode,
  getActionMask,
  indicesToMask,
  OPCODES,
  PHASE_NAMES,
} = require('../../core/battle-engine');

const AI_DELAY_MIN = 180;
const AI_DELAY_MAX = 360;
const PURE_AI_CANDIDATE_LIMIT = 3;
const PURE_AI_ATTACK_ROLLOUTS = 12;
const PURE_AI_DEFENSE_ROLLOUTS = 14;
const PURE_AI_ROLLOUT_MAX_STEPS = 96;
const PURE_AI_ACTION_BUFFER_SIZE = 128;

function aiDelay() {
  return AI_DELAY_MIN + Math.random() * (AI_DELAY_MAX - AI_DELAY_MIN);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function safeIndices(indices) {
  return Array.isArray(indices) ? indices.slice() : [];
}

function safeMaskIndices(state, mask) {
  if (!state || !state.catalog || !state.catalog.indicesByMask || !mask) return [];
  return safeIndices(state.catalog.indicesByMask[mask]);
}

function safeActionScore(value) {
  return Number.isFinite(value) ? value : -Infinity;
}

function getPureActionLabel(opcode) {
  switch (opcode) {
    case OPCODES.ROLL_ATTACK: return 'roll_attack';
    case OPCODES.USE_AURORA_ATTACK: return 'use_aurora_attack';
    case OPCODES.REROLL_ATTACK: return 'reroll_attack';
    case OPCODES.CONFIRM_ATTACK: return 'confirm_attack';
    case OPCODES.ROLL_DEFENSE: return 'roll_defense';
    case OPCODES.USE_AURORA_DEFENSE: return 'use_aurora_defense';
    case OPCODES.CONFIRM_DEFENSE: return 'confirm_defense';
    default: return `opcode_${opcode}`;
  }
}

function describePureAction(action) {
  if (!action) return 'none';
  return `${getPureActionLabel(getActionOpcode(action))}:${getActionMask(action)}`;
}

function logPureAiIssue(room, phaseLabel, aiPlayer, message, extra = {}) {
  const details = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const suffix = details ? ` ${details}` : '';
  console.warn(`[AI][Pure][${room && room.code ? room.code : 'unknown'}][${phaseLabel}] ${aiPlayer && aiPlayer.characterId ? aiPlayer.characterId : 'unknown'} ${message}${suffix}`);
}

function withPureAiSafety(room, phaseLabel, aiPlayer, actionLabel, fn) {
  return () => {
    try {
      fn();
    } catch (err) {
      logPureAiIssue(room, phaseLabel, aiPlayer, `action failed: ${actionLabel}`, {
        error: err && err.message ? err.message : String(err),
      });
    }
  };
}

function clearAIActionTimer(room, aiPlayer) {
  const targetPlayer = aiPlayer || (room && Array.isArray(room.players)
    ? room.players.find((player) => player && player.ws && player.ws.isAI)
    : null);
  if (targetPlayer && targetPlayer.autoActionTimer) {
    clearTimeout(targetPlayer.autoActionTimer);
    targetPlayer.autoActionTimer = null;
  }
  if (targetPlayer) {
    targetPlayer.autoActionKey = '';
    targetPlayer.autoActionDueAt = 0;
  }
  if (room && room.aiAction) {
    if (!targetPlayer || room.aiAction.actorId === targetPlayer.id) {
      room.aiAction = null;
    }
  }
}

function getPendingActionKind(room) {
  if (!room) return null;
  const pendingIsFresh = !!(
    room.pendingActionSet
    && room.pendingActionSet.phase
    && room.engineState
    && room.pendingActionSet.phase === PHASE_NAMES[room.engineState.phase]
    && room.pendingActionSet.round === room.engineState.round
  );
  if (pendingIsFresh) {
    switch (room.pendingActionSet.phase) {
      case 'attack_roll': return 'attack_roll';
      case 'attack_reroll_or_select': return 'attack_select';
      case 'defense_roll': return 'defense_roll';
      case 'defense_select': return 'defense_select';
      default: return null;
    }
  }
  if (room.engineState) {
    switch (room.engineState.phase) {
      case 0: return 'attack_roll';
      case 1: return 'attack_select';
      case 2: return 'defense_roll';
      case 3: return 'defense_select';
      default: return null;
    }
  }
  if (!room.game) return null;
  switch (room.game.phase) {
    case 'attack_roll': return 'attack_roll';
    case 'attack_reroll_or_select': return 'attack_select';
    case 'defense_roll': return 'defense_roll';
    case 'defense_select': return 'defense_select';
    default: return null;
  }
}

function getPendingActionLabel(kind) {
  switch (kind) {
    case 'attack_roll': return '掷攻击骰';
    case 'attack_select': return '选择攻击动作';
    case 'defense_roll': return '掷防御骰';
    case 'defense_select': return '选择防御动作';
    default: return null;
  }
}

function getPendingActorId(room) {
  if (!room) return null;
  const pendingIsFresh = !!(
    room.pendingActionSet
    && room.pendingActionSet.actorId
    && room.engineState
    && room.pendingActionSet.phase === PHASE_NAMES[room.engineState.phase]
    && room.pendingActionSet.round === room.engineState.round
  );
  if (pendingIsFresh) {
    return room.pendingActionSet.actorId;
  }
  if (room.engineState && room.engineUi && Array.isArray(room.engineUi.indexToPlayerId)) {
    const actorIndex = (room.engineState.phase === 0 || room.engineState.phase === 1)
      ? room.engineState.attacker
      : ((room.engineState.phase === 2 || room.engineState.phase === 3) ? room.engineState.defender : -1);
    return actorIndex >= 0 ? room.engineUi.indexToPlayerId[actorIndex] : null;
  }
  if (!room.game) return null;
  if (room.game.phase === 'attack_roll' || room.game.phase === 'attack_reroll_or_select') {
    return room.game.attackerId || null;
  }
  if (room.game.phase === 'defense_roll' || room.game.phase === 'defense_select') {
    return room.game.defenderId || null;
  }
  return null;
}

function buildAIActionKey(room, aiPlayer, actionKind) {
  const state = room && room.engineState;
  const ui = room && room.engineUi;
  const game = room && room.game;
  const pending = room && room.pendingActionSet ? room.pendingActionSet : null;
  return [
    room && room.code ? room.code : 'unknown',
    aiPlayer && aiPlayer.id ? aiPlayer.id : 'AI',
    actionKind || 'none',
    state ? state.status : (game && game.status) || 'unknown',
    state ? state.round : (game && game.round) || 0,
    state ? state.phase : (game && game.phase) || 'none',
    state ? state.attacker : (game && game.attackerId) || 'none',
    state ? state.defender : (game && game.defenderId) || 'none',
    state ? state.rerollsLeft : (game && game.rerollsLeft) || 0,
    state ? state.attackSelectionMask : (game && game.attackSelection ? game.attackSelection.join(',') : ''),
    state ? state.defenseSelectionMask : (game && game.defenseSelection ? game.defenseSelection.join(',') : ''),
    state ? state.attackValue : (game && game.attackValue) || '',
    state ? state.defenseValue : (game && game.defenseValue) || '',
    ui ? ui.attackPreviewMask : '',
    ui ? ui.defensePreviewMask : '',
    pending ? pending.turnId : '',
    pending ? pending.snapshotHash : '',
  ].join('|');
}

function schedulePureAiHandler(room, rooms, delay, phaseLabel, aiPlayer, actionLabel, fn) {
  const actionKind = getPendingActionKind(room);
  const actionKey = buildAIActionKey(room, aiPlayer, actionKind);
  const dueAt = Date.now() + Math.max(0, Math.round(delay || 0));
  clearAIActionTimer(room, aiPlayer);
  aiPlayer.autoActionKey = actionKey;
  aiPlayer.autoActionDueAt = dueAt;
  room.aiAction = {
    actorId: aiPlayer.id,
    key: actionKey,
    kind: actionKind,
    label: getPendingActionLabel(actionKind),
    dueAt,
  };
  aiPlayer.autoActionTimer = setTimeout(withPureAiSafety(room, phaseLabel, aiPlayer, actionLabel, () => {
    aiPlayer.autoActionTimer = null;
    if (!rooms.has(room.code)) return;
    if (aiPlayer.autoActionKey !== actionKey) return;
    if (buildAIActionKey(room, aiPlayer, actionKind) !== actionKey) return;
    aiPlayer.autoActionKey = '';
    aiPlayer.autoActionDueAt = 0;
    if (room.aiAction && room.aiAction.key === actionKey) {
      room.aiAction = null;
    }
    fn();
  }), delay);
}

function getFirstPureActionByOpcode(actionBuffer, count, opcodes) {
  const expected = new Set(Array.isArray(opcodes) ? opcodes : [opcodes]);
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (expected.has(getActionOpcode(action))) return action;
  }
  return 0;
}

function resolvePureAiIndex(room, aiId) {
  if (!room || !room.engineUi) return -1;
  if (room.engineUi.playerIdToIndex && Number.isInteger(room.engineUi.playerIdToIndex[aiId])) {
    return room.engineUi.playerIdToIndex[aiId];
  }
  const fallbackIndex = Array.isArray(room.engineUi.indexToPlayerId)
    ? room.engineUi.indexToPlayerId.indexOf(aiId)
    : -1;
  if (fallbackIndex >= 0) {
    room.engineUi.playerIdToIndex = room.engineUi.playerIdToIndex || {};
    room.engineUi.playerIdToIndex[aiId] = fallbackIndex;
  }
  return fallbackIndex;
}

function choosePurePhaseAction({
  room,
  state,
  actionBuffer,
  count,
  aiIndex,
  aiPlayer,
  phaseLabel,
  rolloutCandidates,
  rolloutIterations,
  rolloutSeed,
  heuristicAction,
  validOpcodes,
}) {
  const phaseOpcodes = Array.isArray(validOpcodes) ? validOpcodes : [];
  const firstLegalAction = getFirstPureActionByOpcode(actionBuffer, count, phaseOpcodes);
  let selectedAction = 0;
  let selectedBy = 'none';

  if (Array.isArray(rolloutCandidates) && rolloutCandidates.length > 0) {
    try {
      const rolloutAction = choosePureActionWithRollout(
        state,
        aiIndex,
        rolloutCandidates,
        rolloutIterations,
        rolloutSeed,
      );
      if (rolloutAction && phaseOpcodes.includes(getActionOpcode(rolloutAction))) {
        selectedAction = rolloutAction;
        selectedBy = 'rollout';
      }
    } catch (err) {
      logPureAiIssue(room, phaseLabel, aiPlayer, 'rollout evaluation failed', {
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  if (!selectedAction && heuristicAction && phaseOpcodes.includes(getActionOpcode(heuristicAction))) {
    selectedAction = heuristicAction;
    selectedBy = 'heuristic';
  }

  if (!selectedAction && firstLegalAction) {
    selectedAction = firstLegalAction;
    selectedBy = 'fallback_first_legal';
    logPureAiIssue(room, phaseLabel, aiPlayer, 'falling back to first legal action', {
      rolloutCandidates: Array.isArray(rolloutCandidates) ? rolloutCandidates.length : 0,
      heuristic: describePureAction(heuristicAction),
      chosen: describePureAction(selectedAction),
    });
  }

  return {
    action: selectedAction,
    selectedBy,
  };
}

function getAiCharacterPool() {
  return RESTRICTED_AI_LOADOUTS
    .filter((loadout) => CharacterRegistry[loadout.characterId])
    .filter((loadout) => {
      const character = CharacterRegistry[loadout.characterId];
      if (allowsNoAurora(character)) return !loadout.auroraDiceId;
      return !!(loadout.auroraDiceId && AuroraRegistry[loadout.auroraDiceId]);
    });
}

function getRandomAiLoadout() {
  const pool = getAiCharacterPool();
  const selected = pool.length > 0 ? randomChoice(pool) : null;
  if (selected) {
    return {
      characterId: selected.characterId,
      auroraDiceId: selected.auroraDiceId || null,
    };
  }

  const fallbackCharacterId = 'zhigengniao';
  return {
    characterId: fallbackCharacterId,
    auroraDiceId: null,
  };
}

function combinations(n, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < n; i += 1) {
      combo.push(i);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

function createAIPlayer(roomCode) {
  const ws = {
    playerId: 'AI',
    playerRoomCode: roomCode,
    isAI: true,
    readyState: -1,
  };

  const loadout = getRandomAiLoadout();
  return {
    id: 'AI',
    ws,
    name: 'AI 瀵规墜',
    characterId: loadout.characterId,
    auroraDiceId: loadout.auroraDiceId,
    reconnectToken: `ai_${roomCode}`,
    isOnline: true,
    disconnectedAt: null,
    graceDeadline: null,
    graceTimer: null,
    autoActionTimer: null,
    auroraSelectionConfirmed: true,
    aiDifficulty: 'elite',
  };
}

function reRandomizeAIPlayer(player) {
  const loadout = getRandomAiLoadout();
  player.characterId = loadout.characterId;
  player.auroraDiceId = loadout.auroraDiceId;
  player.auroraSelectionConfirmed = true;
  player.aiDifficulty = player.aiDifficulty || 'elite';
}

function scoreAttackCombo(dice, indices, characterId, game, playerId) {
  const selected = indices.map((i) => dice[i]);
  let score = selected.reduce((sum, d) => sum + d.value, 0);
  score += safeNumber(characterAiScoreAttack(characterId, dice, indices, game, playerId), 0);
  if (selected.some((d) => d.isAurora && d.hasA)) score += 3;
  return score;
}

function scoreDefenseCombo(dice, indices, characterId, game, playerId) {
  const selected = indices.map((i) => dice[i]);
  let score = selected.reduce((sum, d) => sum + d.value, 0);
  score += safeNumber(characterAiScoreDefense(characterId, dice, indices, game, playerId), 0);
  if (selected.some((d) => d.isAurora && d.hasA)) score += 3;
  return score;
}

function aiChooseAttackSelection(game, aiPlayer) {
  const dice = game.attackDice;
  const needCount = getEffectiveSelectionCount(game.attackLevel[aiPlayer.id], dice.length);
  if (needCount >= dice.length) return dice.map((_, i) => i);

  const destinyIdx = dice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  const combos = combinations(dice.length, needCount);
  const valid = destinyIdx !== -1 ? combos.filter((c) => c.includes(destinyIdx)) : combos;
  if (valid.length === 0) return combos[0];

  let best = valid[0];
  let bestScore = -Infinity;
  for (const combo of valid) {
    const score = scoreAttackCombo(dice, combo, aiPlayer.characterId, game, aiPlayer.id);
    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  return best;
}

function aiChooseDefenseSelection(game, aiPlayer) {
  const dice = game.defenseDice;
  const needCount = getEffectiveSelectionCount(game.defenseLevel[aiPlayer.id], dice.length);
  if (needCount >= dice.length) return dice.map((_, i) => i);

  const destinyIdx = dice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  const combos = combinations(dice.length, needCount);
  const valid = destinyIdx !== -1 ? combos.filter((c) => c.includes(destinyIdx)) : combos;
  if (valid.length === 0) return combos[0];

  let best = valid[0];
  let bestScore = -Infinity;
  for (const combo of valid) {
    const score = scoreDefenseCombo(dice, combo, aiPlayer.characterId, game, aiPlayer.id);
    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  return best;
}

function aiChooseRerollIndices(game, aiPlayer) {
  const dice = game.attackDice;
  if (game.rerollsLeft <= 0) return [];

  const hookReroll = characterAiFilterReroll(aiPlayer.characterId, dice, game, aiPlayer.id);
  if (Array.isArray(hookReroll) && hookReroll.length > 0) return hookReroll.filter(Number.isInteger);

  const candidates = [];
  for (let i = 0; i < dice.length; i += 1) {
    const d = dice[i];
    if (d.isAurora) continue;
    const expected = (d.maxValue + 1) / 2;
    if (d.value < expected) {
      candidates.push({ idx: i, deficit: expected - d.value });
    }
  }
  candidates.sort((a, b) => b.deficit - a.deficit);
  return candidates.slice(0, 3).map((c) => c.idx);
}

function aiShouldUseAurora(aiPlayer, game, role) {
  const verdict = canUseAurora(aiPlayer, game, role);
  if (!verdict.ok) return false;

  const auroraId = aiPlayer.auroraDiceId;
  if (role === 'defense') {
    const atk = game.attackValue || 0;
    if (auroraId === 'starshield') return atk >= 6;
    if (auroraId === 'oath') return atk >= 10 || game.hp[aiPlayer.id] <= 8;
    if (auroraId === 'cactus') return atk >= 8;
    return true;
  }
  return true;
}

function isPureRoom(room) {
  return !!(room && room.engineState && room.engineUi);
}

function buildPureAiPlayerMeta(state, playerIndex) {
  const character = state.catalog.characters[state.characterIndex[playerIndex]];
  const aurora = state.catalog.auroras[state.auroraIndex[playerIndex]];
  return {
    id: `P${playerIndex + 1}`,
    characterId: character ? character.id : null,
    auroraDiceId: aurora ? aurora.id : null,
  };
}

function scorePureAttackIndices(state, aiIndex, indices, gameOverride) {
  const game = gameOverride || projectPureGame(state);
  const aiPlayer = buildPureAiPlayerMeta(state, aiIndex);
  return scoreAttackCombo(game.attackDice, indices, aiPlayer.characterId, game, aiPlayer.id);
}

function scorePureDefenseIndices(state, aiIndex, indices, gameOverride) {
  const game = gameOverride || projectPureGame(state);
  const aiPlayer = buildPureAiPlayerMeta(state, aiIndex);
  return scoreDefenseCombo(game.defenseDice, indices, aiPlayer.characterId, game, aiPlayer.id);
}

function scorePureRerollMask(state, mask, gameOverride) {
  if (!mask) return -Infinity;
  const game = gameOverride || projectPureGame(state);
  const indices = state.catalog.indicesByMask[mask];
  let score = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const die = game.attackDice[indices[i]];
    if (!die || die.isAurora) continue;
    score += ((die.maxValue + 1) / 2) - die.value;
  }
  return score;
}

function getSortedPureActionCandidates(state, actionBuffer, count, opcode, scorer, limit) {
  const candidates = [];
  const seenMasks = new Set();
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (getActionOpcode(action) !== opcode) continue;
    const mask = getActionMask(action);
    if (seenMasks.has(mask)) continue;
    seenMasks.add(mask);
    candidates.push({ action, mask, score: safeActionScore(scorer(mask)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

function findPureActionByMask(actionBuffer, count, opcode, mask) {
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (getActionOpcode(action) === opcode && getActionMask(action) === mask) return action;
  }
  return 0;
}

function findTicketForEncodedAction(room, encodedAction) {
  const pending = room && room.pendingActionSet;
  if (!pending || !pending.byId) return null;
  for (const action of pending.byId.values()) {
    if (action.encodedAction === encodedAction) {
      return {
        turnId: pending.turnId,
        actionId: action.actionId,
      };
    }
  }
  return null;
}

function submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, phaseLabel, encodedAction) {
  let ticket = findTicketForEncodedAction(room, encodedAction);
  if (!ticket) {
    buildPendingActionSet(room);
    ticket = findTicketForEncodedAction(room, encodedAction);
  }
  if (!ticket) {
    logPureAiIssue(room, phaseLabel, aiPlayer, 'missing ticket for encoded action', {
      encodedAction,
      turnId: room && room.pendingActionSet ? room.pendingActionSet.turnId : '',
    });
    return;
  }
  handlers.handleSubmitBattleAction(aiWs, ticket);
}

function chooseHeuristicPureAction(state, actionBuffer, count) {
  if (!count) return 0;
  const actor = (state.phase === 2 || state.phase === 3) ? state.defender : state.attacker;
  const aiPlayer = buildPureAiPlayerMeta(state, actor);
  const game = projectPureGame(state);

  if (state.phase === 0) {
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.ROLL_ATTACK) return actionBuffer[i];
    }
  }

  if (state.phase === 1) {
    let auroraAction = 0;
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.USE_AURORA_ATTACK) {
        auroraAction = actionBuffer[i];
        break;
      }
    }
    if (auroraAction && aiShouldUseAurora(aiPlayer, game, 'attack')) return auroraAction;

    const rerollCandidates = getSortedPureActionCandidates(
      state,
      actionBuffer,
      count,
      OPCODES.REROLL_ATTACK,
      (mask) => scorePureRerollMask(state, mask, game),
      1,
    );
    if (rerollCandidates.length > 0 && rerollCandidates[0].score > 0) {
      return rerollCandidates[0].action;
    }

    const confirmCandidates = getSortedPureActionCandidates(
      state,
      actionBuffer,
      count,
      OPCODES.CONFIRM_ATTACK,
      (mask) => scorePureAttackIndices(state, actor, state.catalog.indicesByMask[mask], game),
      1,
    );
    if (confirmCandidates.length > 0) return confirmCandidates[0].action;
  }

  if (state.phase === 2) {
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.ROLL_DEFENSE) return actionBuffer[i];
    }
  }

  if (state.phase === 3) {
    let auroraAction = 0;
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.USE_AURORA_DEFENSE) {
        auroraAction = actionBuffer[i];
        break;
      }
    }
    if (auroraAction && aiShouldUseAurora(aiPlayer, game, 'defense')) return auroraAction;

    const confirmCandidates = getSortedPureActionCandidates(
      state,
      actionBuffer,
      count,
      OPCODES.CONFIRM_DEFENSE,
      (mask) => scorePureDefenseIndices(state, actor, state.catalog.indicesByMask[mask], game),
      1,
    );
    if (confirmCandidates.length > 0) return confirmCandidates[0].action;
  }

  return actionBuffer[0];
}

function evaluatePureActionByRollout(state, action, aiIndex, iterations, seedBase) {
  const working = cloneState(state);
  applyActionInPlace(working, action);
  const summary = rolloutMany(
    working,
    (simState, simActions, simCount) => chooseHeuristicPureAction(simState, simActions, simCount),
    (simState, simActions, simCount) => chooseHeuristicPureAction(simState, simActions, simCount),
    iterations,
    seedBase,
    { maxSteps: PURE_AI_ROLLOUT_MAX_STEPS, actionBuffer: new Uint16Array(PURE_AI_ACTION_BUFFER_SIZE) },
  );
  const winRate = summary.iterations > 0 ? summary.wins[aiIndex] / summary.iterations : 0;
  const drawRate = summary.iterations > 0 ? summary.draws / summary.iterations : 0;
  const hpDelta = summary.averageRemainingHp[aiIndex] - summary.averageRemainingHp[1 - aiIndex];
  return (winRate * 1000) + (drawRate * 100) + (hpDelta * 10) - summary.averageSteps;
}

function choosePureActionWithRollout(state, aiIndex, candidates, iterations, seedBase) {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  let bestAction = candidates[0].action;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate || !candidate.action) continue;
    let rolloutScore = -Infinity;
    try {
      rolloutScore = evaluatePureActionByRollout(
        state,
        candidate.action,
        aiIndex,
        iterations,
        `${seedBase}:${getActionOpcode(candidate.action)}:${candidate.mask}`,
      );
    } catch {
      rolloutScore = -Infinity;
    }
    const totalScore = safeActionScore(rolloutScore) + (safeNumber(candidate.score, 0) * 0.05);
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestAction = candidate.action;
    }
  }
  return bestAction;
}

function getAiDifficultyConfig(aiPlayer) {
  return getDifficultyConfig(aiPlayer && aiPlayer.aiDifficulty);
}

function chooseStrategicPureAction({
  room,
  state,
  actionBuffer,
  count,
  aiIndex,
  aiPlayer,
  phaseLabel,
  validOpcodes,
}) {
  const difficulty = getAiDifficultyConfig(aiPlayer);
  const phase = state.phase;
  const allowed = new Set(Array.isArray(validOpcodes) ? validOpcodes : []);
  const heuristicAction = chooseHeuristicPureAction(state, actionBuffer, count);
  const candidates = pickCandidateActions(state, actionBuffer, count, aiIndex, phase, difficulty.id)
    .filter((candidate) => allowed.has(candidate.opcode));

  if (difficulty.useTacticalOverrides) {
    const override = applyTacticalOverrides(state, candidates, aiIndex, phaseLabel);
    if (override && allowed.has(getActionOpcode(override))) {
      return { action: override, selectedBy: 'tactical_override' };
    }
  }

  if (candidates.length > 0) {
    const samples = phase === 1 ? difficulty.searchSamplesAttack : difficulty.searchSamplesDefense;
    const searched = searchBestAction(state, candidates, aiIndex, {
      samples,
      maxDecisionMs: difficulty.maxDecisionMs,
    });
    if (searched && allowed.has(getActionOpcode(searched))) {
      return { action: searched, selectedBy: samples > 0 ? 'search' : 'local_eval' };
    }
  }

  if (heuristicAction && allowed.has(getActionOpcode(heuristicAction))) {
    return { action: heuristicAction, selectedBy: 'heuristic' };
  }

  const fallback = getFirstPureActionByOpcode(actionBuffer, count, Array.from(allowed));
  return { action: fallback, selectedBy: 'fallback_first_legal' };
}

function chooseBestPureSelection(room, actionBuffer, count, opcode, scorer) {
  let bestMask = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (getActionOpcode(action) !== opcode) continue;
    const mask = getActionMask(action);
    const indices = safeMaskIndices(room.engineState, mask);
    const score = safeActionScore(scorer(indices));
    if (score > bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  return bestMask;
}

function chooseBestPureReroll(room, actionBuffer, count, game, aiPlayer) {
  const desired = aiChooseRerollIndices(game, aiPlayer);
  const desiredMask = indicesToMask(desired, room.engineState.attackRoll.count);
  if (desiredMask > 0) {
    for (let i = 0; i < count; i += 1) {
      const action = actionBuffer[i];
      if (getActionOpcode(action) === OPCODES.REROLL_ATTACK && getActionMask(action) === desiredMask) {
        return desiredMask;
      }
    }
  }

  let bestMask = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const action = actionBuffer[i];
    if (getActionOpcode(action) !== OPCODES.REROLL_ATTACK) continue;
    const mask = getActionMask(action);
    const indices = safeMaskIndices(room.engineState, mask);
    let score = 0;
    for (let j = 0; j < indices.length; j += 1) {
      const die = game.attackDice[indices[j]];
      if (!die || die.isAurora) continue;
      score += ((die.maxValue + 1) / 2) - die.value;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  return bestMask;
}

function schedulePureAttackRoll(context) {
  const {
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    state,
    aiIndex,
    actionBuffer,
    count,
  } = context;
  if (state.attacker !== aiIndex) return false;
  const rollAction = getFirstPureActionByOpcode(actionBuffer, count, OPCODES.ROLL_ATTACK);
  schedulePureAiHandler(room, rooms, aiDelay(), 'attack_roll', aiPlayer, 'handleRollAttack', () => {
    submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, 'attack_roll', rollAction);
  });
  return true;
}

function schedulePureAttackSelect(context) {
  const {
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    state,
    game,
    aiIndex,
    actionBuffer,
    count,
  } = context;
  if (state.attacker !== aiIndex) return false;
  const delay = aiDelay();
  const chosen = choosePureActionForState(state, aiIndex, {
    difficultyId: aiPlayer && aiPlayer.aiDifficulty,
    actionBuffer,
    count,
    phaseLabel: 'attack_reroll_or_select',
    validOpcodes: [OPCODES.USE_AURORA_ATTACK, OPCODES.REROLL_ATTACK, OPCODES.CONFIRM_ATTACK],
  });
  if (!chosen.action) {
    clearAIActionTimer(room, aiPlayer);
    logPureAiIssue(room, 'attack_reroll_or_select', aiPlayer, 'no legal pure attack action');
    return true;
  }

  if (chosen.action && getActionOpcode(chosen.action) === OPCODES.REROLL_ATTACK) {
    schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, `handleRerollAttack:${chosen.selectedBy}`, () => {
      submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, 'attack_reroll_or_select', chosen.action);
    });
    return true;
  }

  schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, `handleConfirmAttack:${chosen.selectedBy}`, () => {
    submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, 'attack_reroll_or_select', chosen.action);
  });
  return true;
}

function schedulePureDefenseRoll(context) {
  const {
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    state,
    aiIndex,
    actionBuffer,
    count,
  } = context;
  if (state.defender !== aiIndex) return false;
  const rollAction = getFirstPureActionByOpcode(actionBuffer, count, OPCODES.ROLL_DEFENSE);
  schedulePureAiHandler(room, rooms, aiDelay(), 'defense_roll', aiPlayer, 'handleRollDefense', () => {
    submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, 'defense_roll', rollAction);
  });
  return true;
}

function schedulePureDefenseSelect(context) {
  const {
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    state,
    game,
    aiIndex,
    actionBuffer,
    count,
  } = context;
  if (state.defender !== aiIndex) return false;
  const delay = aiDelay();
  const chosen = choosePureActionForState(state, aiIndex, {
    difficultyId: aiPlayer && aiPlayer.aiDifficulty,
    actionBuffer,
    count,
    phaseLabel: 'defense_select',
    validOpcodes: [OPCODES.USE_AURORA_DEFENSE, OPCODES.CONFIRM_DEFENSE],
  });
  if (!chosen.action) {
    clearAIActionTimer(room, aiPlayer);
    logPureAiIssue(room, 'defense_select', aiPlayer, 'no legal pure defense action');
    return true;
  }
  schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, `handleConfirmDefense:${chosen.selectedBy}`, () => {
    submitEncodedActionWithTicket(room, handlers, aiWs, aiPlayer, 'defense_select', chosen.action);
  });
  return true;
}

const PURE_PHASE_STRATEGY_MAP = Object.freeze({
  0: schedulePureAttackRoll,
  1: schedulePureAttackSelect,
  2: schedulePureDefenseRoll,
  3: schedulePureDefenseSelect,
});

function schedulePureAIAction(room, rooms, handlers, aiPlayer, aiWs) {
  const state = room.engineState;
  const game = projectPureGame(state);
  const actionBuffer = room.engineUi.actionBuffer || new Uint16Array(PURE_AI_ACTION_BUFFER_SIZE);
  const count = enumerateActions(state, actionBuffer);
  if (!count) {
    logPureAiIssue(room, state && state.phase != null ? state.phase : 'unknown', aiPlayer, 'no legal actions enumerated');
    return;
  }
  const aiId = aiPlayer.id;
  const aiIndex = resolvePureAiIndex(room, aiId);
  if (aiIndex < 0) {
    logPureAiIssue(room, state && state.phase != null ? state.phase : 'unknown', aiPlayer, 'missing playerIdToIndex mapping', {
      aiId,
    });
    return;
  }

  const strategy = PURE_PHASE_STRATEGY_MAP[state.phase];
  if (!strategy) {
    clearAIActionTimer(room, aiPlayer);
    return;
  }

  const handled = strategy({
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    state,
    game,
    aiIndex,
    actionBuffer,
    count,
  });
  if (!handled) {
    clearAIActionTimer(room, aiPlayer);
  }
}

const LEGACY_PHASE_STRATEGY_MAP = Object.freeze({
  attack_roll(context) {
    const { room, rooms, handlers, aiPlayer, aiWs, aiId, game } = context;
    if (game.attackerId !== aiId) return false;
    schedulePureAiHandler(room, rooms, aiDelay(), 'attack_roll', aiPlayer, 'handleRollAttack', () => {
      handlers.handleRollAttack(aiWs);
    });
    return true;
  },
  attack_reroll_or_select(context) {
    const { room, rooms, handlers, aiPlayer, aiWs, aiId, game } = context;
    if (game.attackerId !== aiId) return false;
    const delay = aiDelay();
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'attack')) {
      schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return true;
    }

    if (game.rerollsLeft > 0) {
      const rerollIndices = aiChooseRerollIndices(game, aiPlayer);
      if (rerollIndices.length > 0) {
        schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleRerollAttack', () => {
          handlers.handleRerollAttack(aiWs, { indices: rerollIndices });
        });
        return true;
      }
    }

    const indices = aiChooseAttackSelection(game, aiPlayer);
    schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleConfirmAttack', () => {
      handlers.handleConfirmAttack(aiWs, { indices });
    });
    return true;
  },
  defense_roll(context) {
    const { room, rooms, handlers, aiPlayer, aiWs, aiId, game } = context;
    if (game.defenderId !== aiId) return false;
    schedulePureAiHandler(room, rooms, aiDelay(), 'defense_roll', aiPlayer, 'handleRollDefense', () => {
      handlers.handleRollDefense(aiWs);
    });
    return true;
  },
  defense_select(context) {
    const { room, rooms, handlers, aiPlayer, aiWs, aiId, game } = context;
    if (game.defenderId !== aiId) return false;
    const delay = aiDelay();
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'defense')) {
      schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return true;
    }

    const indices = aiChooseDefenseSelection(game, aiPlayer);
    schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, 'handleConfirmDefense', () => {
      handlers.handleConfirmDefense(aiWs, { indices });
    });
    return true;
  },
});

function scheduleAIAction(room, rooms, handlers) {
  if (!room || room.status !== 'in_game') {
    clearAIActionTimer(room);
    return;
  }

  const aiPlayer = room.players.find((p) => p.ws && p.ws.isAI);
  if (!aiPlayer) {
    clearAIActionTimer(room);
    return;
  }
  const aiWs = aiPlayer.ws;
  const aiId = aiPlayer.id;
  const game = isPureRoom(room) ? projectPureGame(room.engineState) : room.game;

  if (!game || game.status === 'ended') {
    clearAIActionTimer(room, aiPlayer);
    return;
  }

  if (isPureRoom(room)) {
    buildPendingActionSet(room);
    const pendingActorId = getPendingActorId(room);
    if (pendingActorId !== aiId) {
      clearAIActionTimer(room, aiPlayer);
      return;
    }
    schedulePureAIAction(room, rooms, handlers, aiPlayer, aiWs);
    return;
  }

  const pendingActorId = getPendingActorId(room);
  if (pendingActorId !== aiId) {
    clearAIActionTimer(room, aiPlayer);
    return;
  }

  const strategy = LEGACY_PHASE_STRATEGY_MAP[game.phase];
  if (!strategy) {
    clearAIActionTimer(room, aiPlayer);
    return;
  }

  const handled = strategy({
    room,
    rooms,
    handlers,
    aiPlayer,
    aiWs,
    aiId,
    game,
  });
  if (!handled) {
    clearAIActionTimer(room, aiPlayer);
  }
}

module.exports = {
  createAIPlayer,
  reRandomizeAIPlayer,
  choosePureActionForState,
  scheduleAIAction,
  clearAIActionTimer,
  getPendingActionKind,
  getPendingActionLabel,
  getPendingActorId,
};


