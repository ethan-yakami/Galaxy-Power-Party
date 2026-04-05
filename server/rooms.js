const WebSocket = require('ws');
const { CharacterRegistry, AuroraRegistry } = require('./registry');

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sanitizeRoom(room, viewerPlayerId) {
  const game = room.game
    ? {
        status:                room.game.status,
        round:                 room.game.round,
        attackerId:            room.game.attackerId,
        defenderId:            room.game.defenderId,
        phase:                 room.game.phase,
        rerollsLeft:           room.game.rerollsLeft,
        attackDice:            room.game.attackDice,
        defenseDice:           room.game.defenseDice,
        attackSelection:       room.game.attackSelection,
        defenseSelection:      room.game.defenseSelection,
        attackPreviewSelection:  room.game.attackPreviewSelection,
        defensePreviewSelection: room.game.defensePreviewSelection,
        attackValue:           room.game.attackValue,
        defenseValue:          room.game.defenseValue,
        attackPierce:          room.game.attackPierce,
        lastDamage:            room.game.lastDamage,
        winnerId:              room.game.winnerId,
        log:                   room.game.log,
        hp:                    room.game.hp,
        maxHp:                 room.game.maxHp,
        attackLevel:           room.game.attackLevel,
        defenseLevel:          room.game.defenseLevel,
        auroraUsesRemaining:   room.game.auroraUsesRemaining,
        selectedFourCount:     room.game.selectedFourCount,
        auroraAEffectCount:    room.game.auroraAEffectCount,
        roundAuroraUsed:       room.game.roundAuroraUsed,
        forceField:            room.game.forceField,
        effectEvents:          room.game.effectEvents,
        poison:                room.game.poison,
        resilience:            room.game.resilience,
        thorns:                room.game.thorns,
        power:                 room.game.power,
        hackActive:            room.game.hackActive,
        danhengCounterReady:   room.game.danhengCounterReady,
        xilianCumulative:      room.game.xilianCumulative,
        xilianAscensionActive: room.game.xilianAscensionActive,
        yaoguangRerollsUsed:   room.game.yaoguangRerollsUsed,
      }
    : null;

  return {
    code:          room.code,
    status:        room.status,
    waitingReason: room.waitingReason,
    players: room.players.map((p) => {
      const hideLoadout = room.status === 'lobby' && p.id !== viewerPlayerId;
      return {
        id:            p.id,
        name:          p.name,
        characterId:   hideLoadout ? null : p.characterId,
        characterName: hideLoadout
          ? '未公开'
          : (CharacterRegistry[p.characterId] && CharacterRegistry[p.characterId].name) || p.characterId,
        auroraDiceId:   hideLoadout ? null : p.auroraDiceId,
        auroraDiceName: hideLoadout
          ? null
          : (AuroraRegistry[p.auroraDiceId] && AuroraRegistry[p.auroraDiceId].name) || null,
      };
    }),
    game,
  };
}

function broadcastRoom(room) {
  for (const p of room.players) {
    send(p.ws, {
      type: 'room_state',
      room: sanitizeRoom(room, p.id),
    });
  }
}

function newRoomCode(rooms) {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function getPlayerRoom(ws, rooms) {
  if (!ws.playerRoomCode) return null;
  return rooms.get(ws.playerRoomCode) || null;
}

function getPlayerById(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function isAuroraEquipRequired(player) {
  return true;
}

function readyToStart(room) {
  if (room.players.length !== 2) return { ok: false, reason: '等待另一位玩家加入。' };

  for (const player of room.players) {
    if (!player.characterId) return { ok: false, reason: `${player.name}尚未选择角色。` };
    const ch = CharacterRegistry[player.characterId];
    if (!ch) return { ok: false, reason: `${player.name}角色无效。` };
    if (!player.auroraDiceId) {
      return { ok: false, reason: `${player.name}尚未装备曜彩骰。` };
    }
  }

  return { ok: true, reason: '' };
}

function createNewRoomPlayer(ws, name) {
  return {
    id:           ws.playerId,
    ws,
    name,
    characterId:  'xiadie',
    auroraDiceId: null,
  };
}

function pushEffectEvent(game, event) {
  game.effectEventSeq += 1;
  const wrapped = Object.assign({ id: game.effectEventSeq }, event);
  game.effectEvents.push(wrapped);
  if (game.effectEvents.length > 50) {
    game.effectEvents.shift();
  }
}

module.exports = {
  send,
  sanitizeRoom,
  broadcastRoom,
  newRoomCode,
  getPlayerRoom,
  getPlayerById,
  isAuroraEquipRequired,
  readyToStart,
  createNewRoomPlayer,
  pushEffectEvent,
};
