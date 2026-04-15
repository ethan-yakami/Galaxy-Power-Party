const { getPlayerRoom, send } = require('../../services/rooms');
const {
  buildPendingActionSet,
  consumePendingAction,
  clearPendingActionSet,
} = require('../../services/battle-actions');
const {
  applyActionInPlace,
  indicesToMask,
  OPCODES,
} = require('../../../core/battle-engine');
const { recordPureActionReplay, finalizeReplay, exportReplay } = require('../../services/replay');
const { sendError, ERROR_CODES } = require('../../transport/protocol/errors');

function createBattleHandlers({ rooms, shared }) {
  function submitLegacyOpcodeMask(ws, opcode, mask) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    let pending = shared.ensureFreshPendingActionSet(room);
    if (!pending) {
      sendError(ws, ERROR_CODES.BATTLE_STALE_TURN);
      return;
    }
    let action = shared.findPendingActionByOpcodeAndMask(room, opcode, mask);
    if (!action) {
      pending = buildPendingActionSet(room);
      action = shared.findPendingActionByOpcodeAndMask(room, opcode, mask);
    }
    if (!action) {
      sendError(ws, ERROR_CODES.BATTLE_INVALID_ACTION);
      return;
    }
    handleSubmitBattleAction(ws, { turnId: pending.turnId, actionId: action.actionId });
  }

  function handleSubmitBattleAction(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) {
      sendError(ws, ERROR_CODES.NOT_IN_ROOM);
      return;
    }
    if (!room.engineState || room.status !== 'in_game') {
      sendError(ws, ERROR_CODES.BATTLE_INVALID_ACTION, 'Battle is not active for this room.');
      return;
    }

    const pending = shared.ensureFreshPendingActionSet(room);
    if (!pending) {
      sendError(ws, ERROR_CODES.BATTLE_STALE_TURN);
      return;
    }

    if (pending.actorId !== ws.playerId) {
      sendError(ws, ERROR_CODES.BATTLE_NOT_ACTOR);
      return;
    }

    const turnId = payload && Number.isInteger(payload.turnId) ? payload.turnId : null;
    if (!turnId || turnId !== pending.turnId) {
      sendError(ws, ERROR_CODES.BATTLE_STALE_TURN);
      return;
    }

    const actionId = payload && typeof payload.actionId === 'string'
      ? payload.actionId.trim()
      : '';
    if (!actionId) {
      sendError(ws, ERROR_CODES.BATTLE_INVALID_ACTION);
      return;
    }

    const consumed = consumePendingAction(room, actionId);
    if (!consumed.ok) {
      if (consumed.code === 'consumed') {
        sendError(ws, ERROR_CODES.BATTLE_ACTION_CONSUMED);
      } else {
        sendError(ws, ERROR_CODES.BATTLE_INVALID_ACTION);
      }
      return;
    }

    const logsBefore = room.engineUi.logs.length;
    const effectsBefore = room.engineUi.effectEvents.length;
    const phaseBefore = room.engineState.phase;
    const roundBefore = room.engineState.round;
    const statusBefore = room.engineState.status;
    const winnerBefore = room.engineState.winner;

    const action = consumed.action;
    const result = applyActionInPlace(room.engineState, action.encodedAction, shared.buildRuntime(room));
    if (!result.ok) {
      buildPendingActionSet(room);
      sendError(ws, ERROR_CODES.BATTLE_INVALID_ACTION, result.reason || 'Battle action failed.');
      return;
    }

    recordPureActionReplay(room, {
      encodedAction: action.encodedAction,
      turnId: consumed.turnId,
      actionId,
      actionSnapshotHash: consumed.snapshotHash,
      mutationLog: {
        phaseBefore,
        phaseAfter: room.engineState.phase,
        roundBefore,
        roundAfter: room.engineState.round,
        statusBefore,
        statusAfter: room.engineState.status,
        winnerBefore,
        winnerAfter: room.engineState.winner,
      },
    }, {
      actorId: ws.playerId,
      actionOutcome: result,
      phaseBefore,
      roundBefore,
      statusBefore,
      winnerBefore,
      logsAdded: room.engineUi.logs.slice(logsBefore),
      effectsAdded: room.engineUi.effectEvents.slice(effectsBefore),
    });

    if (result.status === 'ended') {
      clearPendingActionSet(room);
      finalizeReplay(room, 'battle_ended');
    } else {
      buildPendingActionSet(room);
    }

    room.engineUi.attackPreviewMask = 0;
    room.engineUi.defensePreviewMask = 0;
    shared.getBroadcastRoom(room);
  }

  function handleDeprecatedBattleProtocol(ws) {
    sendError(ws, ERROR_CODES.BATTLE_PROTOCOL_DEPRECATED);
  }

  function handleRollAttack(ws) {
    submitLegacyOpcodeMask(ws, OPCODES.ROLL_ATTACK, 0);
  }

  function handleUseAurora(ws) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const phase = room.engineState.phase;
    const opcode = (phase === 2 || phase === 3) ? OPCODES.USE_AURORA_DEFENSE : OPCODES.USE_AURORA_ATTACK;
    submitLegacyOpcodeMask(ws, opcode, 0);
  }

  function handleRerollAttack(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const mask = indicesToMask(payload && payload.indices, room.engineState.attackRoll.count);
    submitLegacyOpcodeMask(ws, OPCODES.REROLL_ATTACK, mask);
  }

  function handleUpdateLiveSelection(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const phase = room.engineState.phase;
    const rollCount = phase === 1 ? room.engineState.attackRoll.count : room.engineState.defenseRoll.count;
    const mask = indicesToMask(payload && payload.indices, rollCount);
    if (mask < 0) return;
    if (room.engineState.phase === 1) {
      const attackerId = room.engineUi.indexToPlayerId[room.engineState.attacker];
      if (attackerId !== ws.playerId) return;
      room.engineUi.attackPreviewMask = mask;
    } else if (room.engineState.phase === 3) {
      const defenderId = room.engineUi.indexToPlayerId[room.engineState.defender];
      if (defenderId !== ws.playerId) return;
      room.engineUi.defensePreviewMask = mask;
    } else {
      return;
    }
    shared.getBroadcastRoom(room);
  }

  function handleConfirmAttack(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const mask = indicesToMask(payload && payload.indices, room.engineState.attackRoll.count);
    submitLegacyOpcodeMask(ws, OPCODES.CONFIRM_ATTACK, mask);
  }

  function handleRollDefense(ws) {
    submitLegacyOpcodeMask(ws, OPCODES.ROLL_DEFENSE, 0);
  }

  function handleConfirmDefense(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const mask = indicesToMask(payload && payload.indices, room.engineState.defenseRoll.count);
    submitLegacyOpcodeMask(ws, OPCODES.CONFIRM_DEFENSE, mask);
  }

  function handleExportReplay(ws, _payload, envelope) {
    const room = getPlayerRoom(ws, rooms);
    if (!room || !room.engineState) return;
    const replay = exportReplay(room);
    send(ws, {
      type: 'replay_export',
      content: JSON.stringify(replay),
      meta: envelope.meta,
    });
  }

  return {
    handleSubmitBattleAction,
    handleDeprecatedBattleProtocol,
    handleRollAttack,
    handleUseAurora,
    handleRerollAttack,
    handleUpdateLiveSelection,
    handleConfirmAttack,
    handleRollDefense,
    handleConfirmDefense,
    handleExportReplay,
  };
}

module.exports = createBattleHandlers;

