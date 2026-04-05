const { CHARACTERS, AURORA_DICE } = require('./characters');
const { canUseAurora } = require('./skills');
const CharacterHooks = require('./characterHooks');

const AI_DELAY_MIN = 600;
const AI_DELAY_MAX = 1500;

function aiDelay() {
  return AI_DELAY_MIN + Math.random() * (AI_DELAY_MAX - AI_DELAY_MIN);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate all combinations of k items from [0..n-1]
function combinations(n, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

// --- Player Creation ---

function createAIPlayer(roomCode) {
  const ws = {
    playerId: 'AI',
    playerRoomCode: roomCode,
    isAI: true,
    readyState: -1, // Not WebSocket.OPEN, so send() will skip
  };

  const charIds = Object.keys(CHARACTERS);
  const charId = randomChoice(charIds);
  const char = CHARACTERS[charId];

  const auroraIds = Object.keys(AURORA_DICE);
  const auroraId = randomChoice(auroraIds);

  return {
    id: 'AI',
    ws,
    name: 'AI 对手',
    characterId: charId,
    auroraDiceId: auroraId,
  };
}

function reRandomizeAIPlayer(player) {
  const charIds = Object.keys(CHARACTERS);
  player.characterId = randomChoice(charIds);
  const char = CHARACTERS[player.characterId];
  player.auroraDiceId = randomChoice(Object.keys(AURORA_DICE));
}

// --- Scoring ---

function scoreAttackCombo(dice, indices, characterId, game, playerId) {
  const selected = indices.map((i) => dice[i]);
  let score = selected.reduce((sum, d) => sum + d.value, 0);

  score += CharacterHooks.aiScoreAttackCombo(characterId, dice, indices, game, playerId);

  // Aurora A effect trigger bonus
  if (selected.some((d) => d.isAurora && d.hasA)) score += 3;

  return score;
}

function scoreDefenseCombo(dice, indices, characterId, game, playerId) {
  const selected = indices.map((i) => dice[i]);
  let score = selected.reduce((sum, d) => sum + d.value, 0);

  score += CharacterHooks.aiScoreDefenseCombo(characterId, dice, indices, game, playerId);

  // Aurora A effect trigger bonus
  if (selected.some((d) => d.isAurora && d.hasA)) score += 3;

  return score;
}

// --- Decision Functions ---

function aiChooseAttackSelection(game, aiPlayer) {
  const dice = game.attackDice;
  const needCount = game.attackLevel[aiPlayer.id];

  if (needCount >= dice.length) {
    return dice.map((_, i) => i);
  }

  const destinyIdx = dice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  const combos = combinations(dice.length, needCount);
  const valid = destinyIdx !== -1 ? combos.filter((c) => c.includes(destinyIdx)) : combos;

  if (valid.length === 0) return combos[0];

  let best = valid[0];
  let bestScore = -Infinity;
  for (const combo of valid) {
    const s = scoreAttackCombo(dice, combo, aiPlayer.characterId, game, aiPlayer.id);
    if (s > bestScore) { bestScore = s; best = combo; }
  }
  return best;
}

function aiChooseDefenseSelection(game, aiPlayer) {
  const dice = game.defenseDice;
  const needCount = game.defenseLevel[aiPlayer.id];

  if (needCount >= dice.length) {
    return dice.map((_, i) => i);
  }

  const destinyIdx = dice.findIndex((d) => d.isAurora && d.auroraId === 'destiny');
  const combos = combinations(dice.length, needCount);
  const valid = destinyIdx !== -1 ? combos.filter((c) => c.includes(destinyIdx)) : combos;

  if (valid.length === 0) return combos[0];

  let best = valid[0];
  let bestScore = -Infinity;
  for (const combo of valid) {
    const s = scoreDefenseCombo(dice, combo, aiPlayer.characterId, game, aiPlayer.id);
    if (s > bestScore) { bestScore = s; best = combo; }
  }
  return best;
}

function aiChooseRerollIndices(game, aiPlayer) {
  const dice = game.attackDice;
  if (game.rerollsLeft <= 0) return [];

  const characterId = aiPlayer.characterId;

  const hookReroll = CharacterHooks.aiFilterReroll(characterId, dice, game, aiPlayer.id);
  if (hookReroll && hookReroll.length > 0) return hookReroll;

  // Default: reroll dice below their expected value
  const candidates = [];
  for (let i = 0; i < dice.length; i++) {
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

  // Attack: generally beneficial to add aurora die to pool
  return true;
}

// --- Scheduling ---

function scheduleAIAction(room, rooms, handlers) {
  if (!room || !room.game) return;
  if (room.status !== 'in_game') return;

  const game = room.game;
  if (game.status === 'ended') return;

  const aiPlayer = room.players.find((p) => p.ws && p.ws.isAI);
  if (!aiPlayer) return;

  const aiWs = aiPlayer.ws;
  const aiId = aiPlayer.id;

  if (game.phase === 'attack_roll' && game.attackerId === aiId) {
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      handlers.handleRollAttack(aiWs);
    }, aiDelay());
    return;
  }

  if (game.phase === 'attack_reroll_or_select' && game.attackerId === aiId) {
    const delay = aiDelay();

    // Step 1: Use aurora die if beneficial
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'attack')) {
      setTimeout(() => {
        if (!rooms.has(room.code)) return;
        handlers.handleUseAurora(aiWs);
      }, delay);
      return;
    }

    // Step 2: Reroll if beneficial
    if (game.rerollsLeft > 0) {
      const rerollIndices = aiChooseRerollIndices(game, aiPlayer);
      if (rerollIndices.length > 0) {
        setTimeout(() => {
          if (!rooms.has(room.code)) return;
          handlers.handleRerollAttack(aiWs, { indices: rerollIndices });
        }, delay);
        return;
      }
    }

    // Step 3: Confirm attack selection
    const indices = aiChooseAttackSelection(game, aiPlayer);
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      handlers.handleConfirmAttack(aiWs, { indices });
    }, delay);
    return;
  }

  if (game.phase === 'defense_roll' && game.defenderId === aiId) {
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      handlers.handleRollDefense(aiWs);
    }, aiDelay());
    return;
  }

  if (game.phase === 'defense_select' && game.defenderId === aiId) {
    const delay = aiDelay();

    // Step 1: Use aurora die if beneficial
    if (!game.roundAuroraUsed[aiId] && aiShouldUseAurora(aiPlayer, game, 'defense')) {
      setTimeout(() => {
        if (!rooms.has(room.code)) return;
        handlers.handleUseAurora(aiWs);
      }, delay);
      return;
    }

    // Step 2: Confirm defense selection
    const indices = aiChooseDefenseSelection(game, aiPlayer);
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      handlers.handleConfirmDefense(aiWs, { indices });
    }, delay);
  }
}

module.exports = {
  createAIPlayer,
  reRandomizeAIPlayer,
  scheduleAIAction,
};
