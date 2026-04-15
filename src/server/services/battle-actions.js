const { createHash } = require('crypto');
const {
  enumerateActions,
  getActionOpcode,
  getActionMask,
  PHASE_NAMES,
  OPCODES,
} = require('../../core/battle-engine');

const ACTION_KIND_BY_OPCODE = Object.freeze({
  [OPCODES.ROLL_ATTACK]: 'roll_attack',
  [OPCODES.USE_AURORA_ATTACK]: 'use_aurora_attack',
  [OPCODES.REROLL_ATTACK]: 'reroll_attack',
  [OPCODES.CONFIRM_ATTACK]: 'confirm_attack',
  [OPCODES.ROLL_DEFENSE]: 'roll_defense',
  [OPCODES.USE_AURORA_DEFENSE]: 'use_aurora_defense',
  [OPCODES.CONFIRM_DEFENSE]: 'confirm_defense',
});

const ACTION_LABEL_BY_KIND = Object.freeze({
  roll_attack: 'Roll Attack',
  use_aurora_attack: 'Use Aurora',
  reroll_attack: 'Reroll Attack Dice',
  confirm_attack: 'Confirm Attack',
  roll_defense: 'Roll Defense',
  use_aurora_defense: 'Use Aurora',
  confirm_defense: 'Confirm Defense',
});

function getActorIndexForPhase(state) {
  if (!state) return -1;
  if (state.phase === 0 || state.phase === 1) return state.attacker;
  if (state.phase === 2 || state.phase === 3) return state.defender;
  return -1;
}

function maskToIndices(mask) {
  const out = [];
  const safeMask = mask >>> 0;
  for (let bit = 0; bit < 6; bit += 1) {
    if ((safeMask >>> bit) & 1) out.push(bit);
  }
  return out;
}

function phaseToPendingKind(phaseName) {
  switch (phaseName) {
    case 'attack_roll':
      return 'attack_roll';
    case 'attack_reroll_or_select':
      return 'attack_select';
    case 'defense_roll':
      return 'defense_roll';
    case 'defense_select':
      return 'defense_select';
    default:
      return null;
  }
}

function phaseToPendingLabel(phaseName) {
  switch (phaseName) {
    case 'attack_roll':
      return 'Roll Attack';
    case 'attack_reroll_or_select':
      return 'Choose Attack Action';
    case 'defense_roll':
      return 'Roll Defense';
    case 'defense_select':
      return 'Choose Defense Action';
    default:
      return null;
  }
}

function createActionSnapshotHash(payload) {
  const content = JSON.stringify(payload);
  return createHash('sha1').update(content).digest('hex');
}

function createPendingSnapshotPayload(actorId, phase, round, actions) {
  return {
    actorId,
    phase,
    round,
    actions,
  };
}

function buildActionPayload(encodedAction) {
  const opcode = getActionOpcode(encodedAction);
  const mask = getActionMask(encodedAction);
  const kind = ACTION_KIND_BY_OPCODE[opcode] || `opcode_${opcode}`;
  const indices = maskToIndices(mask);
  return {
    opcode,
    mask,
    kind,
    label: ACTION_LABEL_BY_KIND[kind] || kind,
    indices,
    selectedCount: indices.length,
  };
}

function clearPendingActionSet(room) {
  if (!room) return;
  room.pendingActionSet = null;
  room.pendingActorId = null;
}

function buildPendingActionSet(room) {
  if (!room || room.status !== 'in_game' || !room.engineState || !room.engineUi) {
    clearPendingActionSet(room);
    return null;
  }

  const state = room.engineState;
  const ui = room.engineUi;
  if (!ui.actionBuffer || !(ui.actionBuffer instanceof Uint16Array)) {
    ui.actionBuffer = new Uint16Array(256);
  }

  const count = enumerateActions(state, ui.actionBuffer);
  if (!count) {
    clearPendingActionSet(room);
    return null;
  }

  const actorIndex = getActorIndexForPhase(state);
  const actorId = (actorIndex >= 0 && Array.isArray(ui.indexToPlayerId))
    ? (ui.indexToPlayerId[actorIndex] || null)
    : null;

  const actions = [];
  for (let i = 0; i < count; i += 1) {
    const encodedAction = ui.actionBuffer[i];
    const payload = buildActionPayload(encodedAction);
    const action = {
      kind: payload.kind,
      label: payload.label,
      mask: payload.mask,
      indices: payload.indices,
      selectedCount: payload.selectedCount,
    };
    actions.push(action);
  }

  const phase = PHASE_NAMES[state.phase] || 'unknown_phase';
  const snapshotHash = createActionSnapshotHash(createPendingSnapshotPayload(actorId, phase, state.round, actions));
  const existing = room.pendingActionSet;
  if (existing && !existing.consumed && existing.snapshotHash === snapshotHash) {
    room.pendingActorId = actorId;
    return existing;
  }

  room.turnId = Number.isInteger(room.turnId) ? (room.turnId + 1) : 1;
  const turnId = room.turnId;
  const byId = new Map();
  for (let i = 0; i < count; i += 1) {
    const encodedAction = ui.actionBuffer[i];
    const payload = buildActionPayload(encodedAction);
    const actionId = `${turnId}:${i + 1}:${encodedAction}`;
    actions[i] = {
      ...actions[i],
      actionId,
    };
    byId.set(actionId, {
      ...actions[i],
      opcode: payload.opcode,
      encodedAction,
    });
  }

  const pendingActionSet = {
    turnId,
    actorId,
    phase,
    round: state.round,
    actions,
    byId,
    snapshotHash,
    consumed: false,
  };

  room.pendingActionSet = pendingActionSet;
  room.pendingActorId = actorId;
  return pendingActionSet;
}

function getPendingActionSet(room) {
  if (!room || room.status !== 'in_game' || !room.engineState || !room.engineUi) return null;
  return buildPendingActionSet(room);
}

function getPendingActionKind(room) {
  const set = getPendingActionSet(room);
  if (!set) return null;
  return phaseToPendingKind(set.phase);
}

function getPendingActionLabel(room) {
  const set = getPendingActionSet(room);
  if (!set) return null;
  return phaseToPendingLabel(set.phase);
}

function getPendingActorId(room) {
  const set = getPendingActionSet(room);
  return set ? (set.actorId || null) : null;
}

function consumePendingAction(room, actionId) {
  const set = getPendingActionSet(room);
  if (!set) {
    return { ok: false, code: 'missing_action_set' };
  }
  if (set.consumed) {
    return { ok: false, code: 'consumed' };
  }
  const action = set.byId.get(actionId);
  if (!action) {
    return { ok: false, code: 'invalid_action' };
  }
  set.consumed = true;
  return {
    ok: true,
    action,
    turnId: set.turnId,
    snapshotHash: set.snapshotHash,
  };
}

function buildBattleActionsMessage(room) {
  if (!room || room.status !== 'in_game' || !room.engineState) return null;
  const set = getPendingActionSet(room);
  if (!set) return null;
  return {
    type: 'battle_actions',
    turnId: set.turnId,
    actorId: set.actorId,
    actions: set.actions,
    phase: set.phase,
    round: set.round,
  };
}

module.exports = {
  ACTION_KIND_BY_OPCODE,
  buildActionPayload,
  buildPendingActionSet,
  getPendingActionSet,
  getPendingActionKind,
  getPendingActionLabel,
  getPendingActorId,
  consumePendingAction,
  buildBattleActionsMessage,
  clearPendingActionSet,
};
