const {
  CharacterRegistry,
  AuroraRegistry,
  allowsNoAurora,
  listCustomVariants,
  upsertCustomVariant,
  removeCustomVariant,
  toggleCustomVariant,
} = require('../../services/registry');
const { send, getPlayerRoom, getPlayerById } = require('../../services/rooms');

function createLobbyHandlers({ rooms, shared, startGameIfReady }) {
  function handleChooseCharacter(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    const { characterId } = payload || {};
    if (!CharacterRegistry[characterId]) return;

    player.characterId = characterId;
    const chosenCharacter = CharacterRegistry[characterId];
    if (allowsNoAurora(chosenCharacter)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = true;
    } else {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = false;
    }

    shared.getBroadcastRoom(room);
    startGameIfReady(room);
  }

  function handleChooseAurora(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;
    const chosenCharacter = CharacterRegistry[player.characterId];
    if (allowsNoAurora(chosenCharacter)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = true;
      shared.getBroadcastRoom(room);
      startGameIfReady(room);
      return;
    }

    const { auroraDiceId } = payload || {};
    if (auroraDiceId && !AuroraRegistry[auroraDiceId]) return;

    player.auroraDiceId = auroraDiceId || null;
    player.auroraSelectionConfirmed = true;
    shared.getBroadcastRoom(room);
    startGameIfReady(room);
  }

  function handleCreateCustomCharacter(ws, payload) {
    try {
      const created = upsertCustomVariant(payload.variant);
      send(ws, { type: 'custom_character_created', id: created.id });
      return true;
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
      return false;
    }
  }

  function handleListCustomCharacters(ws) {
    send(ws, {
      type: 'custom_characters_list',
      characters: listCustomVariants(),
    });
  }

  function handleUpdateCustomCharacter(ws, payload) {
    try {
      const updated = upsertCustomVariant(payload.variant);
      send(ws, { type: 'custom_character_updated', id: updated.id });
      return true;
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
      return false;
    }
  }

  function handleDeleteCustomCharacter(ws, payload) {
    const characterId = payload.characterId || payload.id;
    const success = removeCustomVariant(characterId);
    if (success) {
      send(ws, { type: 'custom_character_deleted', characterId });
    }
    return success;
  }

  function handleToggleCustomCharacter(ws, payload) {
    const characterId = payload.characterId || payload.id;
    const updated = toggleCustomVariant(characterId, payload.enabled);
    if (updated) {
      send(ws, { type: 'custom_character_updated', characterId: updated.id });
    }
    return !!updated;
  }

  function handleApplyPreset(ws, payload) {
    const room = getPlayerRoom(ws, rooms);
    if (!room) return;
    const player = getPlayerById(room, ws.playerId);
    if (!player) return;

    const source = payload && payload.preset && typeof payload.preset === 'object'
      ? payload.preset
      : (payload || {});
    const hasCharacterId = Object.prototype.hasOwnProperty.call(source, 'characterId');
    const hasAuroraDiceId = Object.prototype.hasOwnProperty.call(source, 'auroraDiceId');
    const nextCharacterId = hasCharacterId ? source.characterId : player.characterId;

    if (hasCharacterId) {
      if (!CharacterRegistry[nextCharacterId]) return;
      player.characterId = nextCharacterId;
    }

    const chosenCharacter = CharacterRegistry[player.characterId];
    if (allowsNoAurora(chosenCharacter)) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = true;
    } else if (hasAuroraDiceId) {
      if (source.auroraDiceId && AuroraRegistry[source.auroraDiceId]) {
        player.auroraDiceId = source.auroraDiceId;
        player.auroraSelectionConfirmed = true;
      } else {
        player.auroraDiceId = null;
        player.auroraSelectionConfirmed = false;
      }
    } else if (hasCharacterId) {
      player.auroraDiceId = null;
      player.auroraSelectionConfirmed = false;
    }

    shared.getBroadcastRoom(room);
    startGameIfReady(room);
  }

  return {
    handleChooseCharacter,
    handleChooseAurora,
    handleCreateCustomCharacter,
    handleListCustomCharacters,
    handleUpdateCustomCharacter,
    handleDeleteCustomCharacter,
    handleToggleCustomCharacter,
    handleApplyPreset,
  };
}

module.exports = createLobbyHandlers;
