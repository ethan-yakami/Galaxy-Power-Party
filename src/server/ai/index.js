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
const {
  cloneState,
  enumerateActions,
  applyActionInPlace,
  projectStateToLegacyRoom,
  rolloutMany,
  getActionOpcode,
  getActionMask,
  indicesToMask,
  OPCODES,
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
    case 'attack_select': return '选择攻击骰';
    case 'defense_roll': return '掷防御骰';
    case 'defense_select': return '选择防御骰';
    default: return null;
  }
}

function getPendingActorId(room) {
  if (!room) return null;
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
  const baseOnly = Object.values(CharacterRegistry)
    .filter((c) => !c.isCustomVariant)
    .map((c) => c.id);
  if (baseOnly.length > 0) return baseOnly;
  return Object.keys(CharacterRegistry);
}

function getRandomAiLoadout() {
  const characterId = randomChoice(getAiCharacterPool());
  const character = CharacterRegistry[characterId];
  return {
    characterId,
    auroraDiceId: allowsNoAurora(character) ? null : randomChoice(Object.keys(AuroraRegistry)),
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
    name: 'AI 对手',
    characterId: loadout.characterId,
    auroraDiceId: loadout.auroraDiceId,
    reconnectToken: `ai_${roomCode}`,
    isOnline: true,
    disconnectedAt: null,
    graceDeadline: null,
    graceTimer: null,
    autoActionTimer: null,
    auroraSelectionConfirmed: true,
  };
}

function reRandomizeAIPlayer(player) {
  const loadout = getRandomAiLoadout();
  player.characterId = loadout.characterId;
  player.auroraDiceId = loadout.auroraDiceId;
  player.auroraSelectionConfirmed = true;
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

function createRolloutSessionUi() {
  return {
    indexToPlayerId: ['P1', 'P2'],
    playerIdToIndex: { P1: 0, P2: 1 },
    logs: [],
    effectEvents: [],
    attackPreviewMask: 0,
    defensePreviewMask: 0,
  };
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

function projectPureGame(state) {
  return projectStateToLegacyRoom(state, createRolloutSessionUi());
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

  if (state.phase === 0 && state.attacker === aiIndex) {
    schedulePureAiHandler(room, rooms, aiDelay(), 'attack_roll', aiPlayer, 'handleRollAttack', () => {
      handlers.handleRollAttack(aiWs);
    });
    return;
  }

  if (state.phase === 1 && state.attacker === aiIndex) {
    const delay = aiDelay();
    let auroraAction = 0;
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.USE_AURORA_ATTACK) {
        auroraAction = actionBuffer[i];
        break;
      }
    }
    if (auroraAction && aiShouldUseAurora(aiPlayer, game, 'attack')) {
      schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return;
    }

    const candidates = [];
    const rerollMask = chooseBestPureReroll(room, actionBuffer, count, game, aiPlayer);
    if (rerollMask > 0) {
      const rerollAction = findPureActionByMask(actionBuffer, count, OPCODES.REROLL_ATTACK, rerollMask);
      if (rerollAction) {
        candidates.push({
          action: rerollAction,
          mask: rerollMask,
          score: scorePureRerollMask(state, rerollMask),
        });
      }
    }
    const confirmCandidates = getSortedPureActionCandidates(
      state,
      actionBuffer,
      count,
      OPCODES.CONFIRM_ATTACK,
      (mask) => scoreAttackCombo(game.attackDice, state.catalog.indicesByMask[mask], aiPlayer.characterId, game, aiPlayer.id),
      PURE_AI_CANDIDATE_LIMIT,
    );
    for (let i = 0; i < confirmCandidates.length; i += 1) {
      candidates.push(confirmCandidates[i]);
    }

    const heuristicAction = rerollMask > 0
      ? findPureActionByMask(actionBuffer, count, OPCODES.REROLL_ATTACK, rerollMask)
      : findPureActionByMask(
        actionBuffer,
        count,
        OPCODES.CONFIRM_ATTACK,
        chooseBestPureSelection(
          room,
          actionBuffer,
          count,
          OPCODES.CONFIRM_ATTACK,
          (indices) => scoreAttackCombo(game.attackDice, indices, aiPlayer.characterId, game, aiPlayer.id),
        ),
      );
    const chosen = choosePurePhaseAction({
      room,
      state,
      actionBuffer,
      count,
      aiIndex,
      aiPlayer,
      phaseLabel: 'attack_reroll_or_select',
      rolloutCandidates: candidates,
      rolloutIterations: PURE_AI_ATTACK_ROLLOUTS,
      rolloutSeed: `${room.code}:r${state.round}:p${state.phase}:a${aiIndex}`,
      heuristicAction,
      validOpcodes: [OPCODES.REROLL_ATTACK, OPCODES.CONFIRM_ATTACK],
    });
    if (!chosen.action) {
      clearAIActionTimer(room, aiPlayer);
      logPureAiIssue(room, 'attack_reroll_or_select', aiPlayer, 'no legal pure attack action');
      return;
    }

    if (chosen.action && getActionOpcode(chosen.action) === OPCODES.REROLL_ATTACK) {
      const rerollIndices = safeMaskIndices(room.engineState, getActionMask(chosen.action));
      schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, `handleRerollAttack:${chosen.selectedBy}`, () => {
        handlers.handleRerollAttack(aiWs, { indices: rerollIndices });
      });
      return;
    }

    const selectionMask = chosen.action && getActionOpcode(chosen.action) === OPCODES.CONFIRM_ATTACK
      ? getActionMask(chosen.action)
      : 0;
    const indices = safeMaskIndices(room.engineState, selectionMask);
    schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, `handleConfirmAttack:${chosen.selectedBy}`, () => {
      handlers.handleConfirmAttack(aiWs, { indices });
    });
    return;
  }

  if (state.phase === 2 && state.defender === aiIndex) {
    schedulePureAiHandler(room, rooms, aiDelay(), 'defense_roll', aiPlayer, 'handleRollDefense', () => {
      handlers.handleRollDefense(aiWs);
    });
    return;
  }

  if (state.phase === 3 && state.defender === aiIndex) {
    const delay = aiDelay();
    let auroraAction = 0;
    for (let i = 0; i < count; i += 1) {
      if (getActionOpcode(actionBuffer[i]) === OPCODES.USE_AURORA_DEFENSE) {
        auroraAction = actionBuffer[i];
        break;
      }
    }
    if (auroraAction && aiShouldUseAurora(aiPlayer, game, 'defense')) {
      schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return;
    }

    const confirmCandidates = getSortedPureActionCandidates(
      state,
      actionBuffer,
      count,
      OPCODES.CONFIRM_DEFENSE,
      (mask) => scoreDefenseCombo(game.defenseDice, state.catalog.indicesByMask[mask], aiPlayer.characterId, game, aiPlayer.id),
      PURE_AI_CANDIDATE_LIMIT,
    );
    const heuristicAction = findPureActionByMask(
      actionBuffer,
      count,
      OPCODES.CONFIRM_DEFENSE,
      chooseBestPureSelection(
        room,
        actionBuffer,
        count,
        OPCODES.CONFIRM_DEFENSE,
        (indices) => scoreDefenseCombo(game.defenseDice, indices, aiPlayer.characterId, game, aiPlayer.id),
      ),
    );
    const chosen = choosePurePhaseAction({
      room,
      state,
      actionBuffer,
      count,
      aiIndex,
      aiPlayer,
      phaseLabel: 'defense_select',
      rolloutCandidates: confirmCandidates,
      rolloutIterations: PURE_AI_DEFENSE_ROLLOUTS,
      rolloutSeed: `${room.code}:r${state.round}:p${state.phase}:d${aiIndex}`,
      heuristicAction,
      validOpcodes: [OPCODES.CONFIRM_DEFENSE],
    });
    if (!chosen.action) {
      clearAIActionTimer(room, aiPlayer);
      logPureAiIssue(room, 'defense_select', aiPlayer, 'no legal pure defense action');
      return;
    }
    const indices = safeMaskIndices(room.engineState, chosen.action ? getActionMask(chosen.action) : 0);
    schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, `handleConfirmDefense:${chosen.selectedBy}`, () => {
      handlers.handleConfirmDefense(aiWs, { indices });
    });
  }
}

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

  if (game.phase === 'attack_roll' && game.attackerId === aiId) {
    schedulePureAiHandler(room, rooms, aiDelay(), 'attack_roll', aiPlayer, 'handleRollAttack', () => {
      handlers.handleRollAttack(aiWs);
    });
    return;
  }

  if (game.phase === 'attack_reroll_or_select' && game.attackerId === aiId) {
    const delay = aiDelay();
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'attack')) {
      schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return;
    }

    if (game.rerollsLeft > 0) {
      const rerollIndices = aiChooseRerollIndices(game, aiPlayer);
      if (rerollIndices.length > 0) {
        schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleRerollAttack', () => {
          handlers.handleRerollAttack(aiWs, { indices: rerollIndices });
        });
        return;
      }
    }

    const indices = aiChooseAttackSelection(game, aiPlayer);
    schedulePureAiHandler(room, rooms, delay, 'attack_reroll_or_select', aiPlayer, 'handleConfirmAttack', () => {
      handlers.handleConfirmAttack(aiWs, { indices });
    });
    return;
  }

  if (game.phase === 'defense_roll' && game.defenderId === aiId) {
    schedulePureAiHandler(room, rooms, aiDelay(), 'defense_roll', aiPlayer, 'handleRollDefense', () => {
      handlers.handleRollDefense(aiWs);
    });
    return;
  }

  if (game.phase === 'defense_select' && game.defenderId === aiId) {
    const delay = aiDelay();
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'defense')) {
      schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, 'handleUseAurora', () => {
        handlers.handleUseAurora(aiWs);
      });
      return;
    }

    const indices = aiChooseDefenseSelection(game, aiPlayer);
    schedulePureAiHandler(room, rooms, delay, 'defense_select', aiPlayer, 'handleConfirmDefense', () => {
      handlers.handleConfirmDefense(aiWs, { indices });
    });
    return;
  }

  clearAIActionTimer(room, aiPlayer);
}

module.exports = {
  createAIPlayer,
  reRandomizeAIPlayer,
  scheduleAIAction,
  clearAIActionTimer,
  getPendingActionKind,
  getPendingActionLabel,
  getPendingActorId,
};

