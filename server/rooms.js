const WebSocket = require('ws');
const { CharacterRegistry, AuroraRegistry } = require('./registry');

function send(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sanitizeRoom(room, viewerPlayerId) {
  const game = room.game
    ? {
        status: room.game.status,
        round: room.game.round,
        attackerId: room.game.attackerId,
        defenderId: room.game.defenderId,
        phase: room.game.phase,
        rerollsLeft: room.game.rerollsLeft,
        attackDice: room.game.attackDice,
        defenseDice: room.game.defenseDice,
        attackSelection: room.game.attackSelection,
        defenseSelection: room.game.defenseSelection,
        attackPreviewSelection: room.game.attackPreviewSelection,
        defensePreviewSelection: room.game.defensePreviewSelection,
        attackValue: room.game.attackValue,
        defenseValue: room.game.defenseValue,
        attackPierce: room.game.attackPierce,
        lastDamage: room.game.lastDamage,
        winnerId: room.game.winnerId,
        log: room.game.log,
        hp: room.game.hp,
        maxHp: room.game.maxHp,
        attackLevel: room.game.attackLevel,
        defenseLevel: room.game.defenseLevel,
        auroraUsesRemaining: room.game.auroraUsesRemaining,
        selectedFourCount: room.game.selectedFourCount,
        selectedOneCount: room.game.selectedOneCount,
        overload: room.game.overload,
        desperateBonus: room.game.desperateBonus,
        auroraAEffectCount: room.game.auroraAEffectCount,
        roundAuroraUsed: room.game.roundAuroraUsed,
        forceField: room.game.forceField,
        effectEvents: room.game.effectEvents,
        weather: room.game.weather,
        poison: room.game.poison,
        resilience: room.game.resilience,
        thorns: room.game.thorns,
        power: room.game.power,
        hackActive: room.game.hackActive,
        danhengCounterReady: room.game.danhengCounterReady,
        xilianCumulative: room.game.xilianCumulative,
        xilianAscensionActive: room.game.xilianAscensionActive,
        yaoguangRerollsUsed: room.game.yaoguangRerollsUsed,
      }
    : null;

  return {
    code: room.code,
    status: room.status,
    waitingReason: room.waitingReason,
    players: room.players.map((p) => {
      const hideLoadout = room.status === 'lobby' && p.id !== viewerPlayerId;
      return {
        id: p.id,
        name: p.name,
        characterId: hideLoadout ? null : p.characterId,
        characterName: hideLoadout
          ? '???'
          : (CharacterRegistry[p.characterId] && CharacterRegistry[p.characterId].name) || p.characterId,
        auroraDiceId: hideLoadout ? null : p.auroraDiceId,
        auroraDiceName: hideLoadout
          ? null
          : (AuroraRegistry[p.auroraDiceId] && AuroraRegistry[p.auroraDiceId].name) || null,
        isOnline: p.isOnline !== false,
        disconnectedAt: p.disconnectedAt || null,
        graceDeadline: p.graceDeadline || null,
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
  if (!ws) return null;
  if (ws.playerRoomCode) {
    const directRoom = rooms.get(ws.playerRoomCode) || null;
    if (directRoom) return directRoom;
  }
  if (ws.playerId) {
    for (const room of rooms.values()) {
      if (!room || !Array.isArray(room.players)) continue;
      if (room.players.some((p) => p && p.id === ws.playerId)) {
        ws.playerRoomCode = room.code;
        return room;
      }
    }
  }
  return null;
}

function getPlayerById(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function isAuroraEquipRequired(player) {
  if (!player || !player.characterId) return true;
  const ch = CharacterRegistry[player.characterId];
  if (!ch) return true;
  return ch.auroraUses > 0;
}

function readyToStart(room) {
  if (room.players.length !== 2) return { ok: false, reason: '??????????' };

  for (const player of room.players) {
    if (!player.characterId) return { ok: false, reason: `${player.name}???????` };
    const ch = CharacterRegistry[player.characterId];
    if (!ch) return { ok: false, reason: `${player.name}?????` };
    if (isAuroraEquipRequired(player) && !player.auroraDiceId) {
      return { ok: false, reason: `${player.name}????????` };
    }
  }

  return { ok: true, reason: '' };
}

function createNewRoomPlayer(ws, name) {
  const token = ws && ws.reconnectToken ? ws.reconnectToken : `${Date.now()}_${Math.random()}`;
  return {
    id: ws.playerId,
    ws,
    name,
    characterId: null,
    auroraDiceId: null,
    reconnectToken: token,
    isOnline: true,
    disconnectedAt: null,
    graceDeadline: null,
    graceTimer: null,
    autoActionTimer: null,
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
