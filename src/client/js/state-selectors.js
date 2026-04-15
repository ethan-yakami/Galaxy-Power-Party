(function() {
  function sanitizeDisplayName(name) {
    return String(name || '').replace(/[\[\]【】]/g, '').trim();
  }

  function getMe(room, meId) {
    if (!room || !Array.isArray(room.players)) return null;
    return room.players.find((player) => player.id === meId) || null;
  }

  function getEnemy(room, meId) {
    if (!room || !Array.isArray(room.players)) return null;
    return room.players.find((player) => player.id !== meId) || null;
  }

  function getCharacter(characters, characterId) {
    return (characters && characters[characterId]) || null;
  }

  function getAurora(auroraDice, auroraId) {
    if (!Array.isArray(auroraDice)) return null;
    return auroraDice.find((item) => item.id === auroraId) || null;
  }

  function allowsNoAurora(character) {
    return !!(character && character.allowsNoAurora);
  }

  function normalizeLoadout(input) {
    return {
      characterId: (input && input.characterId) || '',
      auroraId: (input && (input.auroraId || input.auroraDiceId)) || '',
    };
  }

  function loadoutsMatch(left, right) {
    const a = normalizeLoadout(left);
    const b = normalizeLoadout(right);
    return a.characterId === b.characterId && a.auroraId === b.auroraId;
  }

  function indicesToMask(indices, maxCount) {
    if (!Array.isArray(indices)) return -1;
    let mask = 0;
    const limit = Number.isInteger(maxCount) ? maxCount : 6;
    for (let i = 0; i < indices.length; i += 1) {
      const idx = indices[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= limit || idx >= 6) return -1;
      const bit = 1 << idx;
      if (mask & bit) return -1;
      mask |= bit;
    }
    return mask;
  }

  window.GPP = window.GPP || {};
  window.GPP.selectors = {
    sanitizeDisplayName,
    getMe,
    getEnemy,
    getCharacter,
    getAurora,
    allowsNoAurora,
    normalizeLoadout,
    loadoutsMatch,
    indicesToMask,
  };
})();

