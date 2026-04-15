const { broadcastRoom } = require('../../services/rooms');
const { scheduleAIAction, clearAIActionTimer } = require('../../ai');
const {
  buildPendingActionSet,
  getPendingActionSet,
  getPendingActionKind,
  getPendingActionLabel,
  getPendingActorId,
  clearPendingActionSet,
} = require('../../services/battle-actions');
const {
  projectStateToLegacyRoom,
  createRuntime,
  PHASE_NAMES,
} = require('../../../core/battle-engine');

function createSharedHandlers({ rooms, getHandlers }) {
  function buildPendingBattleAction(room) {
    if (!room || room.status !== 'in_game' || !room.engineState || !room.engineUi) return null;
    const actorId = getPendingActorId(room);
    const kind = getPendingActionKind(room);
    if (!actorId || !kind) return null;
    const actor = room.players.find((player) => player && player.id === actorId) || null;
    return {
      actorId,
      kind,
      label: getPendingActionLabel(room),
      isAiThinking: !!(actor && actor.ws && actor.ws.isAI && room.aiAction && room.aiAction.actorId === actorId),
    };
  }

  function getBroadcastRoom(room) {
    const hasAI = room.players.some((p) => p.ws && p.ws.isAI);
    if (hasAI) {
      scheduleAIAction(room, rooms, getHandlers());
    } else {
      clearAIActionTimer(room);
    }

    if (room.status === 'in_game' && room.engineState) {
      room.game = projectStateToLegacyRoom(room.engineState, room.engineUi, {
        pendingAction: buildPendingBattleAction(room),
      });
    } else {
      clearPendingActionSet(room);
      room.game = null;
    }
    broadcastRoom(room);
  }

  function buildRuntime(room) {
    return createRuntime({
      getPlayerName: (idx) => {
        const pid = room.engineUi.indexToPlayerId[idx];
        const p = room.players.find((pp) => pp.id === pid);
        return p ? p.name : `P${idx + 1}`;
      },
      getPlayerId: (idx) => room.engineUi.indexToPlayerId[idx],
      log: (text) => room.engineUi.logs.push(text),
      effect: (event) => {
        const seq = (room.engineUi.effectEvents.length ? room.engineUi.effectEvents[room.engineUi.effectEvents.length - 1].id : 0) + 1;
        room.engineUi.effectEvents.push({ ...event, id: seq });
        if (room.engineUi.effectEvents.length > 50) room.engineUi.effectEvents.shift();
      },
      scratch: { actionBuffer: room.engineUi.actionBuffer, hits: new Int16Array(2) },
    });
  }

  function findPendingActionByOpcodeAndMask(room, opcode, mask) {
    const pending = getPendingActionSet(room);
    if (!pending || !pending.byId) return null;
    for (const action of pending.byId.values()) {
      if (action.opcode === opcode && action.mask === (mask & 0x3f)) return action;
    }
    return null;
  }

  function ensureFreshPendingActionSet(room) {
    if (!room || !room.engineState) return null;
    const expectedPhase = PHASE_NAMES[room.engineState.phase];
    let pending = getPendingActionSet(room);
    if (
      !pending
      || pending.phase !== expectedPhase
      || pending.round !== room.engineState.round
      || pending.consumed
    ) {
      pending = buildPendingActionSet(room);
    }
    return pending;
  }

  return {
    buildPendingBattleAction,
    getBroadcastRoom,
    buildRuntime,
    findPendingActionByOpcodeAndMask,
    ensureFreshPendingActionSet,
  };
}

module.exports = createSharedHandlers;

